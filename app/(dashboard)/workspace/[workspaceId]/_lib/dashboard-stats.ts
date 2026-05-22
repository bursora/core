import {
    periodWindow,
    type BudgetMode,
    type Period,
    type RawBudget,
    type ScopeType,
} from "@/lib/budgeting";
import { startOfDayUtc } from "@/lib/budgeting/period";
import { budgetingDeps, listBudgets } from "@/lib/budgeting/server";
import type { DashboardWindow } from "@/lib/dashboard-window";
import { db, schema } from "@/lib/db";
import { listAlerts } from "@/lib/detection";
import type { MeteringFilters } from "@/lib/metering/metering-read.repository";
import { usageEventsFilterConditions } from "@/lib/metering/usage-events-filters";
import { and, count, eq, gte, lt, sum } from "drizzle-orm";
import { withRequestMemo } from "./per-request-cache";

/** Subset of MeteringFilters that maps onto alert scope tags. */
export type AlertScopeFilters = Pick<MeteringFilters, "tenantId" | "agentId">;

export interface DashboardStatsDeps {
    /** Sum of usage_events.cost_usd for the workspace at or after `since`. */
    readonly sumSpendSince: (
        workspaceId: string,
        since: Date,
        filters?: MeteringFilters,
    ) => Promise<string>;
    /** Sum of usage_events.cost_usd in [since, until). */
    readonly sumSpendBetween: (
        workspaceId: string,
        since: Date,
        until: Date,
        filters?: MeteringFilters,
    ) => Promise<string>;
    /** Count of usage_events rows for the workspace at or after `since`. */
    readonly countCallsSince: (
        workspaceId: string,
        since: Date,
        filters?: MeteringFilters,
    ) => Promise<number>;
    /** Count of usage_events rows in [since, until). */
    readonly countCallsBetween: (
        workspaceId: string,
        since: Date,
        until: Date,
        filters?: MeteringFilters,
    ) => Promise<number>;
    readonly listBudgets: (workspaceId: string) => Promise<readonly RawBudget[]>;
    readonly getBudgetPeriodSpend: (input: {
        workspaceId: string;
        scopeType: ScopeType;
        scopeId: string | null;
        from: Date;
        to: Date;
    }) => Promise<number>;
    /**
     * Batched variant for headroom-style reads that resolve many budgets at
     * once. Returns totals keyed by `${scopeType}:${scopeId ?? ""}:${from.toISOString()}`
     * matching the input items. Production groups by (period, scopeType) so
     * each group hits one SQL.
     */
    readonly getBudgetPeriodSpendBatch?: (input: {
        workspaceId: string;
        items: readonly {
            scopeType: ScopeType;
            scopeId: string | null;
            from: Date;
            to: Date;
        }[];
    }) => Promise<readonly number[]>;
}

let testOverride: DashboardStatsDeps | null = null;

export function setDashboardStatsDepsForTesting(deps: DashboardStatsDeps | null): void {
    testOverride = deps;
}

const productionDeps = (): DashboardStatsDeps => ({
    sumSpendSince: async (workspaceId, since, filters) => {
        const rows = await db()
            .select({ total: sum(schema.usageEvents.costUsd) })
            .from(schema.usageEvents)
            .where(
                and(
                    eq(schema.usageEvents.workspaceId, workspaceId),
                    gte(schema.usageEvents.ts, since),
                    eq(schema.usageEvents.status, "ok"),
                    ...usageEventsFilterConditions(filters),
                ),
            );
        return rows[0]?.total ?? "0.00000000";
    },
    sumSpendBetween: async (workspaceId, since, until, filters) => {
        const rows = await db()
            .select({ total: sum(schema.usageEvents.costUsd) })
            .from(schema.usageEvents)
            .where(
                and(
                    eq(schema.usageEvents.workspaceId, workspaceId),
                    gte(schema.usageEvents.ts, since),
                    lt(schema.usageEvents.ts, until),
                    eq(schema.usageEvents.status, "ok"),
                    ...usageEventsFilterConditions(filters),
                ),
            );
        return rows[0]?.total ?? "0.00000000";
    },
    countCallsSince: async (workspaceId, since, filters) => {
        const rows = await db()
            .select({ total: count() })
            .from(schema.usageEvents)
            .where(
                and(
                    eq(schema.usageEvents.workspaceId, workspaceId),
                    gte(schema.usageEvents.ts, since),
                    eq(schema.usageEvents.status, "ok"),
                    ...usageEventsFilterConditions(filters),
                ),
            );
        return rows[0]?.total ?? 0;
    },
    countCallsBetween: async (workspaceId, since, until, filters) => {
        const rows = await db()
            .select({ total: count() })
            .from(schema.usageEvents)
            .where(
                and(
                    eq(schema.usageEvents.workspaceId, workspaceId),
                    gte(schema.usageEvents.ts, since),
                    lt(schema.usageEvents.ts, until),
                    eq(schema.usageEvents.status, "ok"),
                    ...usageEventsFilterConditions(filters),
                ),
            );
        return rows[0]?.total ?? 0;
    },
    listBudgets: (workspaceId) => listBudgets(workspaceId),
    getBudgetPeriodSpend: ({ workspaceId, scopeType, scopeId, from, to }) =>
        budgetingDeps().spend.getSpendForScopePeriod({
            workspaceId,
            scopeType,
            scopeId,
            from,
            to,
        }),
    getBudgetPeriodSpendBatch: async ({ workspaceId, items }) => {
        const spend = budgetingDeps().spend;
        if (spend.getSpendForScopePeriodBatch) {
            return spend.getSpendForScopePeriodBatch({ workspaceId, items });
        }
        return Promise.all(
            items.map((it) =>
                spend.getSpendForScopePeriod({
                    workspaceId,
                    scopeType: it.scopeType,
                    scopeId: it.scopeId,
                    from: it.from,
                    to: it.to,
                }),
            ),
        );
    },
});

const deps = (): DashboardStatsDeps => testOverride ?? productionDeps();

export function startOfMonthUtc(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function getSpendMtdImpl(input: {
    workspaceId: string;
    now?: Date;
    filters?: MeteringFilters;
}): Promise<string> {
    const since = startOfMonthUtc(input.now ?? new Date());
    return deps().sumSpendSince(input.workspaceId, since, input.filters);
}

export const getSpendMtd = withRequestMemo(getSpendMtdImpl);

async function getSpendInWindowImpl(input: {
    workspaceId: string;
    from: Date;
    to: Date;
    filters?: MeteringFilters;
}): Promise<number> {
    const raw = await deps().sumSpendBetween(
        input.workspaceId,
        input.from,
        input.to,
        input.filters,
    );
    return Number(raw);
}

export const getSpendInWindow = withRequestMemo(getSpendInWindowImpl);

async function getCallsInWindowImpl(input: {
    workspaceId: string;
    from: Date;
    to: Date;
    filters?: MeteringFilters;
}): Promise<number> {
    return deps().countCallsBetween(input.workspaceId, input.from, input.to, input.filters);
}

export const getCallsInWindow = withRequestMemo(getCallsInWindowImpl);

/**
 * Compares spend in `[from, to)` against `[priorFrom, priorTo)` and returns
 * a signed fractional delta (e.g. +0.12 = 12% above prior). Pure: the caller
 * passes both window pairs, so this works for any window the dashboard
 * filter resolves.
 */
export async function getSpendDelta(input: {
    workspaceId: string;
    from: Date;
    to: Date;
    priorFrom: Date;
    priorTo: Date;
    filters?: MeteringFilters;
}): Promise<number> {
    const dep = deps().sumSpendBetween;
    const [recent, prior] = await Promise.all([
        dep(input.workspaceId, input.from, input.to, input.filters).then(Number),
        dep(input.workspaceId, input.priorFrom, input.priorTo, input.filters).then(Number),
    ]);
    return computeDelta(recent, prior);
}

export async function getCallsDelta(input: {
    workspaceId: string;
    from: Date;
    to: Date;
    priorFrom: Date;
    priorTo: Date;
    filters?: MeteringFilters;
}): Promise<number> {
    const dep = deps().countCallsBetween;
    const [recent, prior] = await Promise.all([
        dep(input.workspaceId, input.from, input.to, input.filters),
        dep(input.workspaceId, input.priorFrom, input.priorTo, input.filters),
    ]);
    return computeDelta(recent, prior);
}

// One bucket per UTC day touched by `[from, to)`; sub-day windows collapse
// to a single bucket so an in-progress today still has a partial row.
function bucketBoundaries(from: Date, to: Date): readonly { since: Date; until: Date }[] {
    const start = startOfDayUtc(from);
    const endDay = startOfDayUtc(to);
    const dayCount = Math.max(1, Math.round((endDay.getTime() - start.getTime()) / MS_PER_DAY) + 1);
    return Array.from({ length: dayCount }, (_, i) => {
        const since = new Date(start.getTime() + i * MS_PER_DAY);
        const until = new Date(since.getTime() + MS_PER_DAY);
        return { since, until };
    });
}

async function getSpendSeriesImpl(input: {
    workspaceId: string;
    from: Date;
    to: Date;
    filters?: MeteringFilters;
}): Promise<readonly number[]> {
    const dep = deps().sumSpendBetween;
    const buckets = bucketBoundaries(input.from, input.to);
    return Promise.all(
        buckets.map((b) => dep(input.workspaceId, b.since, b.until, input.filters).then(Number)),
    );
}

export const getSpendSeries = withRequestMemo(getSpendSeriesImpl);

async function getCallsSeriesImpl(input: {
    workspaceId: string;
    from: Date;
    to: Date;
    filters?: MeteringFilters;
}): Promise<readonly number[]> {
    const dep = deps().countCallsBetween;
    const buckets = bucketBoundaries(input.from, input.to);
    return Promise.all(buckets.map((b) => dep(input.workspaceId, b.since, b.until, input.filters)));
}

export const getCallsSeries = withRequestMemo(getCallsSeriesImpl);

export async function countAlertsInWindow(
    workspaceId: string,
    from: Date,
    to: Date,
    scope?: AlertScopeFilters,
): Promise<number> {
    const rows = await listAlerts({
        workspaceId,
        from,
        to,
        ...(scope?.tenantId !== undefined ? { tenantId: scope.tenantId } : {}),
        ...(scope?.agentId !== undefined ? { agentId: scope.agentId } : {}),
    });
    return rows.length;
}

export async function countActiveBudgets(workspaceId: string): Promise<number> {
    const rows = await getBudgetList(workspaceId);
    return rows.length;
}

/**
 * Per-render budget list loader. Routes through `deps().listBudgets` so test
 * overrides work the same as for the rest of the dashboard surface, and
 * `withRequestMemo` shares one DB read across panels that need the budget
 * list (trajectories, headroom, what-breaks-first).
 */
export const getBudgetList = withRequestMemo(
    async (workspaceId: string): Promise<readonly RawBudget[]> => deps().listBudgets(workspaceId),
);

const SPARKLINE_DAYS = 7;
const MS_PER_DAY = 86_400_000;

export async function getSpendMtdSeries(input: {
    workspaceId: string;
    now?: Date;
    filters?: MeteringFilters;
    days?: number;
}): Promise<readonly number[]> {
    const now = input.now ?? new Date();
    const days = input.days ?? SPARKLINE_DAYS;
    const endExclusive = new Date(startOfDayUtc(now).getTime() + MS_PER_DAY);
    const dep = deps().sumSpendBetween;

    const buckets = await Promise.all(
        Array.from({ length: days }, (_, i) => {
            const offsetFromEnd = days - i;
            const since = new Date(endExclusive.getTime() - offsetFromEnd * MS_PER_DAY);
            const until = new Date(since.getTime() + MS_PER_DAY);
            return dep(input.workspaceId, since, until, input.filters).then(Number);
        }),
    );

    return buckets;
}

export async function getSpendMtdDelta(input: {
    workspaceId: string;
    now?: Date;
    filters?: MeteringFilters;
}): Promise<number> {
    const now = input.now ?? new Date();
    const endExclusive = new Date(startOfDayUtc(now).getTime() + MS_PER_DAY);
    const recentStart = new Date(endExclusive.getTime() - SPARKLINE_DAYS * MS_PER_DAY);
    const priorStart = new Date(recentStart.getTime() - SPARKLINE_DAYS * MS_PER_DAY);

    const dep = deps().sumSpendBetween;
    const [recent, prior] = await Promise.all([
        dep(input.workspaceId, recentStart, endExclusive, input.filters).then(Number),
        dep(input.workspaceId, priorStart, recentStart, input.filters).then(Number),
    ]);

    return computeDelta(recent, prior);
}

// Carve-outs: both zero → 0; prior zero, current positive → +1.0.
export function computeDelta(current: number, prior: number): number {
    if (prior === 0) return current === 0 ? 0 : 1;
    return (current - prior) / prior;
}

export async function getCallsMtd(input: {
    workspaceId: string;
    now?: Date;
    filters?: MeteringFilters;
}): Promise<number> {
    const since = startOfMonthUtc(input.now ?? new Date());
    return deps().countCallsSince(input.workspaceId, since, input.filters);
}

export async function getCallsMtdSeries(input: {
    workspaceId: string;
    now?: Date;
    filters?: MeteringFilters;
}): Promise<readonly number[]> {
    const now = input.now ?? new Date();
    const endExclusive = new Date(startOfDayUtc(now).getTime() + MS_PER_DAY);
    const dep = deps().countCallsBetween;

    return Promise.all(
        Array.from({ length: SPARKLINE_DAYS }, (_, i) => {
            const offsetFromEnd = SPARKLINE_DAYS - i;
            const since = new Date(endExclusive.getTime() - offsetFromEnd * MS_PER_DAY);
            const until = new Date(since.getTime() + MS_PER_DAY);
            return dep(input.workspaceId, since, until, input.filters);
        }),
    );
}

export async function getCallsMtdDelta(input: {
    workspaceId: string;
    now?: Date;
    filters?: MeteringFilters;
}): Promise<number> {
    const now = input.now ?? new Date();
    const endExclusive = new Date(startOfDayUtc(now).getTime() + MS_PER_DAY);
    const recentStart = new Date(endExclusive.getTime() - SPARKLINE_DAYS * MS_PER_DAY);
    const priorStart = new Date(recentStart.getTime() - SPARKLINE_DAYS * MS_PER_DAY);

    const dep = deps().countCallsBetween;
    const [recent, prior] = await Promise.all([
        dep(input.workspaceId, recentStart, endExclusive, input.filters),
        dep(input.workspaceId, priorStart, recentStart, input.filters),
    ]);

    return computeDelta(recent, prior);
}

export interface ProjectedEom {
    /** Linear extrapolation from MTD spend to a full month. */
    readonly projected: number;
    /** Total spend in the previous calendar month. */
    readonly priorMonth: number;
    /** $/day burn rate so far this month. */
    readonly dailyRate: number;
    /** Whole UTC days elapsed in the current month (min 1). */
    readonly daysElapsed: number;
    /** Days in the current calendar month. */
    readonly daysInMonth: number;
}

async function getProjectedEomImpl(input: {
    workspaceId: string;
    now?: Date;
    filters?: MeteringFilters;
}): Promise<ProjectedEom> {
    const now = input.now ?? new Date();
    const monthStart = startOfMonthUtc(now);
    const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const priorMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

    const dep = deps().sumSpendBetween;
    const [mtdStr, priorStr] = await Promise.all([
        dep(input.workspaceId, monthStart, nextMonthStart, input.filters),
        dep(input.workspaceId, priorMonthStart, monthStart, input.filters),
    ]);

    const mtd = Number.parseFloat(mtdStr);
    const priorMonth = Number.parseFloat(priorStr);

    const daysInMonth = Math.round((nextMonthStart.getTime() - monthStart.getTime()) / MS_PER_DAY);
    const elapsedMs = now.getTime() - monthStart.getTime();
    const daysElapsedExact = Math.max(elapsedMs / MS_PER_DAY, 1 / 24);
    const daysElapsed = Math.max(1, Math.floor(elapsedMs / MS_PER_DAY) + 1);

    const dailyRate = mtd / daysElapsedExact;
    const projected = dailyRate * daysInMonth;

    return {
        projected: Number.isFinite(projected) ? projected : 0,
        priorMonth: Number.isFinite(priorMonth) ? priorMonth : 0,
        dailyRate: Number.isFinite(dailyRate) ? dailyRate : 0,
        daysElapsed,
        daysInMonth,
    };
}

export const getProjectedEom = withRequestMemo(getProjectedEomImpl);

export interface DailyRate {
    /** `$/day` over the window. For `today`, equals the day's spend so far. */
    readonly dailyRate: number;
    /** Whole days the window has covered, floored at 1. */
    readonly daysElapsed: number;
}

/**
 * Burn rate for a dashboard window. `today` collapses to a single day so the
 * displayed `$/day` is just the day's spend; `week`/`month` divide by the
 * count of whole UTC days elapsed (min 1).
 */
export async function getDailyRateInWindow(input: {
    workspaceId: string;
    window: DashboardWindow;
    filters?: MeteringFilters;
}): Promise<DailyRate> {
    const { workspaceId, window, filters } = input;
    const spend = Number.parseFloat(
        await deps().sumSpendBetween(workspaceId, window.from, window.to, filters),
    );
    const daysElapsed =
        window.key === "today"
            ? 1
            : Math.max(
                  1,
                  Math.floor((window.to.getTime() - window.from.getTime()) / MS_PER_DAY) + 1,
              );
    const safeSpend = Number.isFinite(spend) ? spend : 0;
    return { dailyRate: safeSpend / daysElapsed, daysElapsed };
}

/**
 * Window-aware pace delta. Compares spend in `[from, to)` against the prior
 * period truncated to the same elapsed length, so the two figures share an
 * equal denominator. Returns a signed fractional delta (e.g. +0.2 = 20% hotter).
 */
export async function getSpendPaceInWindow(input: {
    workspaceId: string;
    window: DashboardWindow;
    filters?: MeteringFilters;
}): Promise<number> {
    const { workspaceId, window, filters } = input;
    const elapsedMs = window.to.getTime() - window.from.getTime();
    const priorEnd = new Date(window.priorFrom.getTime() + elapsedMs);

    const dep = deps().sumSpendBetween;
    const [recent, prior] = await Promise.all([
        dep(workspaceId, window.from, window.to, filters).then(Number),
        dep(workspaceId, window.priorFrom, priorEnd, filters).then(Number),
    ]);
    return computeDelta(recent, prior);
}

/**
 * Monthly spend cap used as the denominator for the dashboard's Runway hero.
 *
 * Returns the workspace-scope monthly budget's `amountUsd` when one exists,
 * `null` otherwise. With no workspace budget the dashboard renders the
 * percentage line as "-".
 */
async function getMonthlySpendCapImpl(workspaceId: string): Promise<number | null> {
    const budgets = await getBudgetList(workspaceId);
    const workspaceMonthly = budgets.find(
        (b) => b.scopeType === "workspace" && b.period === "monthly",
    );
    if (workspaceMonthly) {
        const parsed = Number.parseFloat(workspaceMonthly.amountUsd);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
}

export const getMonthlySpendCap = withRequestMemo(getMonthlySpendCapImpl);

export type PaceDirection = "accelerating" | "steady" | "cooling";

const PACE_BAND = 0.05;

/** Classifies a wk/wk delta into one of three pace buckets. */
export function paceDirection(delta: number): PaceDirection {
    if (delta > PACE_BAND) return "accelerating";
    if (delta < -PACE_BAND) return "cooling";
    return "steady";
}

const CONFIDENCE_MIN_DAYS = 7;

/**
 * Forecast confidence label for the Runway projection. Reflects how much
 * MTD data backs the linear extrapolation: 7+ days reads as "high"; less
 * than 7 reads as "low (only N days)" so the user knows the projection is
 * thin.
 */
export function confidenceLabel(daysElapsed: number): string {
    if (daysElapsed >= CONFIDENCE_MIN_DAYS) return `high (${daysElapsed} days of data)`;
    return `low (only ${daysElapsed} days)`;
}

export interface BudgetHeadroomRow {
    readonly id: string;
    readonly scopeType: ScopeType;
    readonly scopeId: string | null;
    readonly period: Period;
    readonly mode: BudgetMode;
    readonly limit: number;
    readonly spent: number;
    /** spent / limit, clamped to [0, 1] for the bar; raw value may exceed 1. */
    readonly usage: number;
}

async function getBudgetHeadroomImpl(input: {
    workspaceId: string;
    limit: number;
    now?: Date;
}): Promise<readonly BudgetHeadroomRow[]> {
    const now = input.now ?? new Date();
    const d = deps();
    const budgets = await d.listBudgets(input.workspaceId);
    if (budgets.length === 0) return [];

    const items = budgets.map((b) => {
        const { from, to } = periodWindow(b.period, now);
        return { scopeType: b.scopeType, scopeId: b.scopeId, from, to };
    });

    const spents = d.getBudgetPeriodSpendBatch
        ? await d.getBudgetPeriodSpendBatch({ workspaceId: input.workspaceId, items })
        : await Promise.all(
              items.map((it) =>
                  d.getBudgetPeriodSpend({
                      workspaceId: input.workspaceId,
                      scopeType: it.scopeType,
                      scopeId: it.scopeId,
                      from: it.from,
                      to: it.to,
                  }),
              ),
          );

    const rows = budgets.map((b, i): BudgetHeadroomRow => {
        const limit = Number.parseFloat(b.amountUsd);
        const safeLimit = limit > 0 ? limit : 0;
        const spent = spents[i] ?? 0;
        const usage = safeLimit === 0 ? 0 : spent / safeLimit;
        return {
            id: b.id,
            scopeType: b.scopeType,
            scopeId: b.scopeId,
            period: b.period,
            mode: b.mode,
            limit: safeLimit,
            spent,
            usage,
        };
    });

    return [...rows].sort((a, b) => b.usage - a.usage).slice(0, input.limit);
}

export const getBudgetHeadroom = withRequestMemo(getBudgetHeadroomImpl);
