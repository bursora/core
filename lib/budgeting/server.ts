/**
 * Budgeting wiring.
 *
 * Wires the read path for `GET /api/v1/budget`, the auth-handshake path for
 * `POST /api/v1/test`, and the `/budgets` dashboard server actions
 * (list/create/update/delete). Routes and pages never import infrastructure
 * directly — they call the wrappers here.
 *
 * Tests override the wiring via `setBudgetingDepsForTesting` so routes can
 * run against in-memory fakes without DB or Redis.
 */

import { db, schema } from "@/lib/db";
import { and, count, eq, gte, inArray, lt, min, sql, sum } from "drizzle-orm";
import "server-only";
import type { AlertRepository } from "../detection/alert.repository";
import { drizzleAlertRepository } from "../detection/drizzle-alert.repository";
import type { EventBus } from "../event-bus";
import { eventBus } from "../in-memory-event-bus";
import { ensureNotificationBootstrap } from "../notification/bootstrap";
import type { BudgetMode, Decision, ScopeType } from "./budget";
import type { BudgetListFilter, BudgetRepository, RawBudget } from "./budget.repository";
import { createBudgetUseCase } from "./create-budget.usecase";
import { decideBudgetUseCase, type RecordBlockedCall } from "./decide-budget.usecase";
import { deleteBudgetUseCase } from "./delete-budget.usecase";
import { DrizzleBudgetRepository } from "./drizzle-budget.repository";
import { DrizzleSpendAggregator } from "./drizzle-spend.aggregator";
import { getBudgetUseCase } from "./get-budget.usecase";
import { listBudgetsUseCase } from "./list-budgets.usecase";
import { periodWindow, type Period } from "./period";
import { recordBlockedWithRetry, type BlockedRowPayload } from "./record-blocked-with-retry";
import type { SpendAggregator } from "./spend-aggregator";
import { updateBudgetUseCase, type UpdateBudgetPatch } from "./update-budget.usecase";

export interface BudgetingDeps {
    readonly budgets: BudgetRepository;
    readonly spend: SpendAggregator;
    readonly now: () => Date;
    readonly ttlSeconds?: number;
    readonly bus?: EventBus;
    readonly alerts?: AlertRepository;
    readonly recordBlocked?: RecordBlockedCall;
}

let testOverride: BudgetingDeps | null = null;

/**
 * Inject test-only deps. Pass `null` to clear and revert to production wiring.
 * Only intended for use from `tests/`.
 */
export function setBudgetingDepsForTesting(deps: BudgetingDeps | null): void {
    testOverride = deps;
}

export function budgetingDeps(): BudgetingDeps {
    if (testOverride !== null) return testOverride;

    ensureNotificationBootstrap();

    const ttl = parseTtl(process.env.BURSORA_DECISION_TTL_S);
    return {
        budgets: new DrizzleBudgetRepository(db()),
        spend: new DrizzleSpendAggregator(db()),
        now: () => new Date(),
        bus: eventBus(),
        alerts: drizzleAlertRepository(db()),
        recordBlocked: defaultRecordBlocked,
        ...(ttl === undefined ? {} : { ttlSeconds: ttl }),
    };
}

/**
 * Stamps a `status='blocked'` row into `usage_events` so the dashboard and
 * notification enrichment can count denials without a separate table. Cost
 * stays at `'0'`; `provider`/`model` carry the SDK's intended target (NULL
 * for SDKs that don't send them). `decidedByBudgetId` records the budget
 * that tripped, powering the blocked call drilldown on /budgets.
 *
 * `blockReason` is the protocol reason string from `evaluateBudget` and
 * surfaces in the Blocks tab.
 *
 * The FK `decided_by_budget_id → budgets(id)` can fail when the deciding
 * budget is deleted between decide and write. `recordBlockedWithRetry`
 * inserts a second time with the column nulled so the workspace-wide count
 * stays correct (per-budget attribution is dropped — the budget is gone).
 */
const insertBlockedRow = async (payload: BlockedRowPayload): Promise<void> => {
    await db().insert(schema.usageEvents).values({
        workspaceId: payload.workspaceId,
        tenantId: payload.tenantId,
        agentId: payload.agentId,
        workflowId: payload.workflowId,
        provider: payload.intendedProvider,
        model: payload.intendedModel,
        promptTokens: 0,
        completionTokens: 0,
        cacheTokens: 0,
        costUsd: "0",
        status: "blocked",
        decidedByBudgetId: payload.decidedByBudgetId,
        blockReason: payload.blockReason,
        ts: payload.ts,
    });
};

const defaultRecordBlocked: RecordBlockedCall = async (row) => {
    await recordBlockedWithRetry(insertBlockedRow, {
        workspaceId: row.workspaceId,
        tenantId: row.tenantId,
        agentId: row.agentId,
        workflowId: row.workflowId,
        ts: row.ts,
        decidedByBudgetId: row.budgetId,
        intendedProvider: row.intendedProvider,
        intendedModel: row.intendedModel,
        blockReason: row.blockReason,
    });
};

function parseTtl(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n;
}

export async function decideBudget(input: {
    workspaceId: string;
    tenantId: string | null;
    agentId: string | null;
    workflowId: string | null;
    intendedProvider?: string | null;
    intendedModel?: string | null;
}): Promise<Decision> {
    const deps = budgetingDeps();
    return decideBudgetUseCase({
        workspaceId: input.workspaceId,
        tenantId: input.tenantId,
        agentId: input.agentId,
        workflowId: input.workflowId,
        intendedProvider: input.intendedProvider ?? null,
        intendedModel: input.intendedModel ?? null,
        now: deps.now(),
        budgets: deps.budgets,
        spend: deps.spend,
        ...(deps.bus === undefined ? {} : { bus: deps.bus }),
        ...(deps.alerts === undefined ? {} : { alerts: deps.alerts }),
        ...(deps.recordBlocked === undefined ? {} : { recordBlocked: deps.recordBlocked }),
        ...(deps.ttlSeconds === undefined ? {} : { ttlSeconds: deps.ttlSeconds }),
    });
}

const dashboardRepo = () => new DrizzleBudgetRepository(db());

export async function listBudgets(
    workspaceId: string,
    filter?: BudgetListFilter,
): Promise<readonly RawBudget[]> {
    return listBudgetsUseCase({
        workspaceId,
        budgets: dashboardRepo(),
        ...(filter !== undefined ? { filter } : {}),
    });
}

export async function getBudget(workspaceId: string, id: string): Promise<RawBudget | null> {
    return getBudgetUseCase({ workspaceId, id, budgets: dashboardRepo() });
}

export interface BudgetStats {
    readonly usedUsd: number;
    readonly calls: number;
    readonly tokens: number;
    readonly topModel: { readonly model: string; readonly share: number } | null;
    readonly periodFromIso: string;
    readonly periodToIso: string;
    readonly currentlyBlocking: boolean;
    readonly firstTrippedAt: Date | null;
    readonly crossingCountThisPeriod: number;
}

/**
 * True when a budget is actively denying calls right now: mode is 'block' and
 * `usedUsd >= capUsd`. Mirrors `evaluateBudget`'s trip check so dashboard
 * surfaces match SDK behavior. Pure: no clock, no DB.
 *
 * Shared by `getBudgetStats` (badge on /budgets), the incident-state read
 * model, and the workspace-wide banner. Kept adjacent so downstream surfaces
 * import without circularity.
 */
export function isBudgetCurrentlyBlocking(
    mode: BudgetMode,
    usedUsd: number,
    capUsd: number,
): boolean {
    return mode === "block" && usedUsd >= capUsd;
}

/**
 * Resolves richer per-budget stats for the dashboard list: current-period
 * spend, call count, token total, top model contributor, period window
 * boundaries (so the client can derive reset countdown and burn projection),
 * the live `currentlyBlocking` flag, and the period's first trip timestamp
 * with crossing count (sourced from the `alerts` table).
 *
 * Two parallel queries per budget — the usage_events aggregate (grouped by
 * model) and the alerts trip lookup keyed by `(workspaceId, kind='budget',
 * scopeId, periodFrom)`.
 */
interface SpendBucket {
    usedUsd: number;
    calls: number;
    tokens: number;
    topModel: string | null;
    topCost: number;
}

const emptySpendBucket = (): SpendBucket => ({
    usedUsd: 0,
    calls: 0,
    tokens: 0,
    topModel: null,
    topCost: -1,
});

const ingestSpendRow = (
    bucket: SpendBucket,
    row: { model: string | null; cost: string | null; calls: number | string; tokens: string },
): void => {
    const cost = parseNumeric(row.cost);
    bucket.usedUsd += cost;
    bucket.calls += Number(row.calls);
    bucket.tokens += parseNumeric(row.tokens);
    if (cost > bucket.topCost) {
        bucket.topCost = cost;
        bucket.topModel = row.model;
    }
};

const scopeColumn = (scopeType: ScopeType) => {
    if (scopeType === "tenant") return schema.usageEvents.tenantId;
    if (scopeType === "agent") return schema.usageEvents.agentId;
    return schema.usageEvents.workflowId;
};

export async function getBudgetStats(
    workspaceId: string,
    budgets: readonly RawBudget[],
): Promise<Record<string, BudgetStats>> {
    if (budgets.length === 0) return {};
    const { now } = budgetingDeps();
    const at = now();
    const conn = db();

    // Bucket each budget into a spend group. Workspace-wide and any-with-null-scope
    // budgets all share the same workspace aggregate per period; narrowed budgets
    // (tenant/agent/workflow with a concrete scopeId) group by (period, scopeType).
    const periodWindows = new Map<Period, { from: Date; to: Date }>();
    const workspaceGroups = new Map<Period, RawBudget[]>();
    const narrowedGroups = new Map<
        string,
        { period: Period; scopeType: ScopeType; budgets: RawBudget[] }
    >();

    for (const b of budgets) {
        if (!periodWindows.has(b.period)) periodWindows.set(b.period, periodWindow(b.period, at));
        const narrowed =
            (b.scopeType === "tenant" || b.scopeType === "agent" || b.scopeType === "workflow") &&
            b.scopeId !== null;
        if (!narrowed) {
            const arr = workspaceGroups.get(b.period) ?? [];
            arr.push(b);
            workspaceGroups.set(b.period, arr);
            continue;
        }
        const key = `${b.period}:${b.scopeType}`;
        const existing = narrowedGroups.get(key);
        if (existing) existing.budgets.push(b);
        else narrowedGroups.set(key, { period: b.period, scopeType: b.scopeType, budgets: [b] });
    }

    const spendByBudget = new Map<string, SpendBucket>(
        budgets.map((b) => [b.id, emptySpendBucket()]),
    );
    const tripByBudget = new Map<string, { firstAt: Date | null; crossings: number }>();

    const spendQueries: Promise<void>[] = [];

    for (const [period, group] of workspaceGroups) {
        const win = periodWindows.get(period);
        if (!win) continue;
        spendQueries.push(
            (async () => {
                const rows = await conn
                    .select({
                        model: schema.usageEvents.model,
                        cost: sum(schema.usageEvents.costUsd),
                        calls: count(),
                        tokens: sql<string>`COALESCE(SUM(${schema.usageEvents.promptTokens} + ${schema.usageEvents.completionTokens} + ${schema.usageEvents.cacheTokens}), 0)`,
                    })
                    .from(schema.usageEvents)
                    .where(
                        and(
                            eq(schema.usageEvents.workspaceId, workspaceId),
                            eq(schema.usageEvents.status, "ok"),
                            gte(schema.usageEvents.ts, win.from),
                            lt(schema.usageEvents.ts, win.to),
                        ),
                    )
                    .groupBy(schema.usageEvents.model);
                for (const b of group) {
                    const bucket = spendByBudget.get(b.id);
                    if (!bucket) continue;
                    for (const r of rows) ingestSpendRow(bucket, r);
                }
            })(),
        );
    }

    for (const { period, scopeType, budgets: group } of narrowedGroups.values()) {
        const win = periodWindows.get(period);
        if (!win) continue;
        const column = scopeColumn(scopeType);
        const scopeIds = group.map((b) => b.scopeId).filter((id): id is string => id !== null);
        if (scopeIds.length === 0) continue;
        spendQueries.push(
            (async () => {
                const rows = await conn
                    .select({
                        scopeId: column,
                        model: schema.usageEvents.model,
                        cost: sum(schema.usageEvents.costUsd),
                        calls: count(),
                        tokens: sql<string>`COALESCE(SUM(${schema.usageEvents.promptTokens} + ${schema.usageEvents.completionTokens} + ${schema.usageEvents.cacheTokens}), 0)`,
                    })
                    .from(schema.usageEvents)
                    .where(
                        and(
                            eq(schema.usageEvents.workspaceId, workspaceId),
                            eq(schema.usageEvents.status, "ok"),
                            gte(schema.usageEvents.ts, win.from),
                            lt(schema.usageEvents.ts, win.to),
                            inArray(column, scopeIds),
                        ),
                    )
                    .groupBy(column, schema.usageEvents.model);
                const byScope = new Map<string, typeof rows>();
                for (const r of rows) {
                    if (r.scopeId === null) continue;
                    const arr = byScope.get(r.scopeId) ?? [];
                    arr.push(r);
                    byScope.set(r.scopeId, arr);
                }
                for (const b of group) {
                    if (b.scopeId === null) continue;
                    const bucket = spendByBudget.get(b.id);
                    if (!bucket) continue;
                    const scopeRows = byScope.get(b.scopeId) ?? [];
                    for (const r of scopeRows) ingestSpendRow(bucket, r);
                }
            })(),
        );
    }

    // Alerts: one query per period covers every budget in that period.
    const alertQueries: Promise<void>[] = [];
    const byPeriodIds = new Map<Period, string[]>();
    for (const b of budgets) {
        const arr = byPeriodIds.get(b.period) ?? [];
        arr.push(b.id);
        byPeriodIds.set(b.period, arr);
    }
    for (const [period, ids] of byPeriodIds) {
        const win = periodWindows.get(period);
        if (!win || ids.length === 0) continue;
        alertQueries.push(
            (async () => {
                const rows = await conn
                    .select({
                        scopeId: schema.alerts.scopeId,
                        firstAt: min(schema.alerts.raisedAt),
                        crossings: count(),
                    })
                    .from(schema.alerts)
                    .where(
                        and(
                            eq(schema.alerts.workspaceId, workspaceId),
                            eq(schema.alerts.kind, "budget"),
                            inArray(schema.alerts.scopeId, ids),
                            eq(schema.alerts.periodFrom, win.from),
                        ),
                    )
                    .groupBy(schema.alerts.scopeId);
                for (const r of rows) {
                    if (r.scopeId === null) continue;
                    tripByBudget.set(r.scopeId, {
                        firstAt: r.firstAt ?? null,
                        crossings: Number(r.crossings),
                    });
                }
            })(),
        );
    }

    await Promise.all([...spendQueries, ...alertQueries]);

    const result: Record<string, BudgetStats> = {};
    for (const b of budgets) {
        const win = periodWindows.get(b.period);
        const bucket = spendByBudget.get(b.id) ?? emptySpendBucket();
        const trip = tripByBudget.get(b.id);
        const top =
            bucket.topModel !== null && bucket.usedUsd > 0
                ? { model: bucket.topModel, share: bucket.topCost / bucket.usedUsd }
                : null;
        const capUsd = Number.parseFloat(b.amountUsd);
        result[b.id] = {
            usedUsd: bucket.usedUsd,
            calls: bucket.calls,
            tokens: bucket.tokens,
            topModel: top,
            periodFromIso: (win?.from ?? new Date(0)).toISOString(),
            periodToIso: (win?.to ?? new Date(0)).toISOString(),
            currentlyBlocking: isBudgetCurrentlyBlocking(
                b.mode,
                bucket.usedUsd,
                Number.isFinite(capUsd) ? capUsd : 0,
            ),
            firstTrippedAt: trip?.firstAt ?? null,
            crossingCountThisPeriod: trip?.crossings ?? 0,
        };
    }
    return result;
}

function parseNumeric(value: string | number | null): number {
    if (value === null) return 0;
    const n = typeof value === "number" ? value : Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

export async function createBudget(input: {
    workspaceId: string;
    scopeType: ScopeType;
    scopeId: string | null;
    period: Period;
    amountUsd: string;
    mode: BudgetMode;
}): Promise<RawBudget> {
    return createBudgetUseCase({
        workspaceId: input.workspaceId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        period: input.period,
        amountUsd: input.amountUsd,
        mode: input.mode,
        budgets: dashboardRepo(),
    });
}

export async function updateBudget(input: {
    id: string;
    workspaceId: string;
    patch: UpdateBudgetPatch;
}): Promise<RawBudget | null> {
    return updateBudgetUseCase({
        id: input.id,
        workspaceId: input.workspaceId,
        patch: input.patch,
        budgets: dashboardRepo(),
    });
}

export async function deleteBudget(input: { id: string; workspaceId: string }): Promise<boolean> {
    return deleteBudgetUseCase({
        id: input.id,
        workspaceId: input.workspaceId,
        budgets: dashboardRepo(),
    });
}
