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

import { clickhouseClient, type ClickHouse } from "@/lib/clickhouse/client";
import { db, schema } from "@/lib/db";
import { isAdminOwnedWorkspace } from "@/lib/identity/server";
import { clickHouseSpendRepository } from "@/lib/spend";
import { and, count, eq, inArray, min } from "drizzle-orm";
import "server-only";
import type { AlertRepository } from "../detection/alert.repository";
import { drizzleAlertRepository } from "../detection/drizzle-alert.repository";
import { errMessage } from "../error-message";
import type { EventBus } from "../event-bus";
import { ALERT_RAISED_TOPIC } from "../event-bus";
import { eventBus } from "../in-memory-event-bus";
import { ClickHouseUsageEventRepository } from "../metering/clickhouse-usage-event.repository";
import { blockedUsageEventRow } from "../metering/usage-event";
import type { UsageEventRepository } from "../metering/usage-event.repository";
import { ensureNotificationBootstrap } from "../notification/bootstrap";
import type { BudgetMode, Decision, ScopeType } from "./budget";
import type { BudgetListFilter, BudgetRepository, RawBudget } from "./budget.repository";
import { ClickHouseSpendAggregator } from "./clickhouse-spend.aggregator";
import { createBudgetUseCase } from "./create-budget.usecase";
import {
    decideBudgetUseCase,
    type BudgetCrossingTrigger,
    type RecordBlockedCall,
} from "./decide-budget.usecase";
import { DrizzleBudgetRepository } from "./drizzle-budget.repository";
import { periodWindow, type Period } from "./period";
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
    /**
     * Resolves whether the workspace is admin-owned (operator dogfood tenant).
     * Optional: production falls back to the real resolver; tests inject a fake.
     */
    readonly isAdminOwnedWorkspace?: (workspaceId: string) => Promise<boolean>;
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
    const ch = clickhouseClient();
    return {
        budgets: new DrizzleBudgetRepository(db()),
        spend: new ClickHouseSpendAggregator(clickHouseSpendRepository(ch)),
        now: () => new Date(),
        bus: eventBus(),
        alerts: drizzleAlertRepository(db()),
        recordBlocked: clickHouseRecordBlocked(new ClickHouseUsageEventRepository(ch)),
        ...(ttl === undefined ? {} : { ttlSeconds: ttl }),
    };
}

/**
 * Builds the blocked-event sink: stamps a `status='blocked'` usage event into
 * ClickHouse (the canonical store) so the dashboard and notification enrichment
 * can count denials without a separate table.
 *
 * ClickHouse carries no FK on `decided_by_budget_id`, so a budget deleted
 * between decide and write needs no retry: the row lands with its id intact.
 */
export function clickHouseRecordBlocked(events: UsageEventRepository): RecordBlockedCall {
    return async (row) => {
        await events.insertBatch([blockedUsageEventRow(row)]);
    };
}

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
    // Admin-owned workspaces (operator dogfood tenants) never block on budget.
    // Resolve first so we can skip the blocked-row write and the crossing alert.
    const adminOwned = await (deps.isAdminOwnedWorkspace ?? isAdminOwnedWorkspace)(
        input.workspaceId,
    );

    const result = await decideBudgetUseCase({
        workspaceId: input.workspaceId,
        tenantId: input.tenantId,
        agentId: input.agentId,
        workflowId: input.workflowId,
        intendedProvider: input.intendedProvider ?? null,
        intendedModel: input.intendedModel ?? null,
        now: deps.now(),
        budgets: deps.budgets,
        spend: deps.spend,
        // An admin-owned workspace is never blocked, so don't stamp a blocked row.
        ...(adminOwned || deps.recordBlocked === undefined
            ? {}
            : { recordBlocked: deps.recordBlocked }),
        ...(deps.ttlSeconds === undefined ? {} : { ttlSeconds: deps.ttlSeconds }),
    });

    if (!adminOwned && result.trigger !== undefined) {
        await dispatchBudgetCrossing(result.trigger, deps);
    }

    return adminOwned ? liftBlock(result.decision) : result.decision;
}

/**
 * Flips a block decision to allow for an admin-owned workspace, leaving the
 * headroom snapshot (`remainingUsd`/`resetAt`) intact so the SDK self-degrade
 * path still sees real numbers. Mode drops to `notify` so the SDK never throws.
 */
function liftBlock(decision: Decision): Decision {
    if (decision.allow) return decision;
    return { ...decision, allow: true, mode: "notify" };
}

/**
 * Records the crossing into the alert repository, then — on a fresh insert —
 * publishes a `BudgetAlertRaisedEvent` on the event bus so the notification
 * fan-out runs. Errors are logged and swallowed so a publish/record failure
 * never bubbles into the SDK preflight response.
 */
async function dispatchBudgetCrossing(
    trigger: BudgetCrossingTrigger,
    deps: BudgetingDeps,
): Promise<void> {
    if (deps.alerts === undefined) return;

    try {
        const result = await deps.alerts.recordBudgetCrossing(trigger.crossing);
        if (!result.inserted || result.id === null || deps.bus === undefined) return;

        const event = trigger.buildEvent(result.id);
        // Fire-and-forget: dispatch handler awaits webhook POSTs + SMTP, which
        // can take seconds. The SDK pre-call decision must not block on them.
        void deps.bus.publish(ALERT_RAISED_TOPIC, event).catch((err) => {
            console.warn("budget_alert.publish_failed", {
                workspaceId: trigger.crossing.workspaceId,
                budgetId: trigger.crossing.budgetId,
                error: errMessage(err),
            });
        });
    } catch (err) {
        console.warn("budget_alert.record_failed", {
            workspaceId: trigger.crossing.workspaceId,
            budgetId: trigger.crossing.budgetId,
            error: errMessage(err),
        });
    }
}

const dashboardRepo = () => new DrizzleBudgetRepository(db());

export async function listBudgets(
    workspaceId: string,
    filter?: BudgetListFilter,
): Promise<readonly RawBudget[]> {
    return filter === undefined
        ? dashboardRepo().listByWorkspace(workspaceId)
        : dashboardRepo().listByWorkspace(workspaceId, filter);
}

export async function getBudget(workspaceId: string, id: string): Promise<RawBudget | null> {
    return dashboardRepo().findById(id, workspaceId);
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

type ScopeColumn = "tenant_id" | "agent_id" | "workflow_id";

const scopeColumn = (scopeType: ScopeType): ScopeColumn => {
    if (scopeType === "tenant") return "tenant_id";
    if (scopeType === "agent") return "agent_id";
    return "workflow_id";
};

export interface BudgetSpendRollupRow {
    readonly scopeId: string | null;
    readonly model: string | null;
    readonly cost: string | null;
    readonly calls: number;
    readonly tokens: string;
}

/**
 * Per-(scope?, model) spend rollup for the /budgets dashboard, read from the
 * canonical ClickHouse store. `status='ok'` rows in the half-open `[from, to)`
 * window; money and token totals stay strings over the wire (`toString(sum(…))`)
 * so the caller's `ingestSpendRow` parses full precision. Pass `scope` to
 * restrict to a tag column and a set of ids (narrowed budgets), grouping by
 * `(scope, model)`; omit it for the workspace-wide aggregate grouped by model.
 * Empty-string tags/models map back to `null` to match the PG nullable columns.
 */
export async function fetchBudgetSpendRollup(
    ch: ClickHouse,
    input: {
        workspaceId: string;
        from: Date;
        to: Date;
        scope?: { column: ScopeColumn; ids: readonly string[] };
    },
): Promise<readonly BudgetSpendRollupRow[]> {
    const scope = input.scope;
    if (scope && scope.ids.length === 0) return [];

    const conditions = [
        "workspace_id = {workspaceId:UUID}",
        "status = 'ok'",
        "toUnixTimestamp64Milli(ts) >= {fromMs:Int64}",
        "toUnixTimestamp64Milli(ts) < {toMs:Int64}",
    ];
    const params: Record<string, unknown> = {
        workspaceId: input.workspaceId,
        fromMs: input.from.getTime(),
        toMs: input.to.getTime(),
    };
    if (scope) {
        conditions.push(`${scope.column} IN {scopeIds:Array(String)}`);
        params.scopeIds = scope.ids;
    }

    const scopeSelect = scope ? `${scope.column} AS scope_id, ` : "";
    const groupBy = scope ? "scope_id, model" : "model";

    const rows = await ch.query<{
        scope_id?: string;
        model: string;
        cost: string | null;
        calls: string;
        tokens: string | null;
    }>({
        query: `SELECT
                ${scopeSelect}model,
                toString(sum(cost_usd)) AS cost,
                count() AS calls,
                toString(sum(prompt_tokens + completion_tokens + cache_tokens)) AS tokens
            FROM usage_events
            WHERE ${conditions.join(" AND ")}
            GROUP BY ${groupBy}`,
        query_params: params,
    });

    return rows.map((r) => ({
        scopeId: scope ? (r.scope_id ? r.scope_id : null) : null,
        model: r.model === "" ? null : r.model,
        cost: r.cost,
        calls: Number(r.calls),
        tokens: r.tokens ?? "0",
    }));
}

export async function getBudgetStats(
    workspaceId: string,
    budgets: readonly RawBudget[],
): Promise<Record<string, BudgetStats>> {
    if (budgets.length === 0) return {};
    const { now } = budgetingDeps();
    const at = now();
    const conn = db();
    const ch = clickhouseClient();

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
                const rows = await fetchBudgetSpendRollup(ch, {
                    workspaceId,
                    from: win.from,
                    to: win.to,
                });
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
                const rows = await fetchBudgetSpendRollup(ch, {
                    workspaceId,
                    from: win.from,
                    to: win.to,
                    scope: { column, ids: scopeIds },
                });
                const byScope = new Map<string, BudgetSpendRollupRow[]>();
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
        if (win === undefined) {
            throw new Error(`invariant: period window missing for "${b.period}"`);
        }
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
            periodFromIso: win.from.toISOString(),
            periodToIso: win.to.toISOString(),
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
    return dashboardRepo().delete(input.id, input.workspaceId);
}
