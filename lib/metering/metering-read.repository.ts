/**
 * Port for the read-side metering queries used by dashboards.
 *
 * Implementations aggregate `usage_events` by bucket + facet value and return
 * pre-shaped projections. The application layer derives the concrete
 * `windowStart`, `windowEnd`, and `bucketSeconds` from the user's `{from, to}`
 * window before calling the port.
 */

import type { Facet, SeriesPoint } from "./spend-series";

/**
 * Cross-cutting dimension filters every metering read query supports. Each
 * field is AND-applied to the underlying rows; within a single field, values
 * are OR-combined (IN list). An empty array or undefined means "no filter on
 * this dimension".
 */
export interface MeteringFilters {
    readonly provider?: readonly string[] | undefined;
    readonly tenantId?: readonly string[] | undefined;
    readonly agentId?: readonly string[] | undefined;
    readonly workflowId?: readonly string[] | undefined;
    readonly model?: readonly string[] | undefined;
}

/**
 * Restricts rows to a single `usage_events.status`. `'ok'` (default) is the
 * historical behavior. `'blocked'` returns only budget-denial rows. `'both'`
 * omits the predicate entirely.
 */
export type MeteringStatusFilter = "ok" | "blocked" | "both";

export interface SpendSeriesQuery extends MeteringFilters {
    readonly workspaceId: string;
    readonly facet: Facet;
    /** Inclusive lower bound of the window (UTC). */
    readonly windowStart: Date;
    /** Exclusive upper bound of the window (UTC). */
    readonly windowEnd: Date;
    /** Bucket granularity in seconds. */
    readonly bucketSeconds: number;
    /** Optional filter: restrict rows to a single value of the facet column. */
    readonly scopeId?: string | undefined;
    /** Defaults to `'ok'` when omitted. */
    readonly status?: MeteringStatusFilter | undefined;
}

export interface TopSpendersQuery extends MeteringFilters {
    readonly workspaceId: string;
    readonly facet: Facet;
    readonly windowStart: Date;
    readonly windowEnd: Date;
    readonly limit: number;
    readonly scopeId?: string | undefined;
    /** Defaults to `'ok'` when omitted. */
    readonly status?: MeteringStatusFilter | undefined;
}

export interface TopSpenderRow {
    readonly tag: string | null;
    readonly costUsd: string;
    readonly callCount: number;
    /**
     * Count of `status='blocked'` rows for this tag in the window. Always
     * populated regardless of the query's `status` filter so the dashboard
     * can render a blocked column alongside the cost column.
     */
    readonly blockedCount: number;
}

export interface CountEventsQuery extends MeteringFilters {
    readonly workspaceId: string;
    readonly since?: Date;
    /** Defaults to `'ok'` when omitted. */
    readonly status?: MeteringStatusFilter | undefined;
}

export interface LastUsageEventAtQuery {
    readonly workspaceId: string;
}

export type ScopeKind = "tenant" | "agent" | "workflow" | "provider" | "model";

export interface DistinctValueWithCount {
    readonly value: string;
    readonly count: number;
}

/**
 * Returns distinct values + counts for several scopes in a single round-trip.
 * Dashboard pages need 2–5 facets at once for their filter pills; firing one
 * query per scope adds up to a noticeable round-trip tax.
 */
export interface ListDistinctValuesBulkQuery {
    readonly workspaceId: string;
    readonly scopes: readonly ScopeKind[];
    readonly sinceDays: number;
    readonly limit: number;
    readonly now: Date;
    /** Defaults to `'ok'` when omitted. */
    readonly status?: MeteringStatusFilter | undefined;
}

export type DistinctValuesByScope = Readonly<
    Partial<Record<ScopeKind, readonly DistinctValueWithCount[]>>
>;

/**
 * Per-event read for the Blocks tab on /budgets/[id]. The tab needs row-level
 * detail (who, when), not aggregates — distinct from the dashboard queries
 * above. Filters: workspace + budget + `status='blocked'` + period window.
 */
export interface BlockedEventsForBudgetQuery {
    readonly workspaceId: string;
    readonly budgetId: string;
    /** Inclusive lower bound of the period (UTC). */
    readonly from: Date;
    /** Exclusive upper bound of the period (UTC). */
    readonly to: Date;
    /**
     * Opaque cursor from a previous page's `nextCursor`. Encodes `(ts, id)`
     * so a burst of denials sharing a millisecond stays addressable across
     * pages. Omitted on the first page. Malformed cursors yield a fresh
     * first page.
     */
    readonly cursor?: string;
    readonly limit: number;
}

export interface CountBlockedEventsForBudgetQuery {
    readonly workspaceId: string;
    readonly budgetId: string;
    readonly from: Date;
    readonly to: Date;
}

export interface BlockedEventRow {
    /** ISO 8601 timestamp string for HTTP transport. */
    readonly ts: string;
    readonly tenantId: string | null;
    readonly agentId: string | null;
    readonly workflowId: string | null;
    /** SDK's intended call target. NULL for blocked rows from older SDKs. */
    readonly intendedProvider: string | null;
    readonly intendedModel: string | null;
    /** Protocol reason string from `evaluateBudget`. NULL for older rows. */
    readonly blockReason: string | null;
}

export interface BlockedEventsPage {
    readonly items: readonly BlockedEventRow[];
    /**
     * Opaque cursor for the next page, or `null` when this is the last page.
     * Pass it back as `cursor` to fetch older rows.
     */
    readonly nextCursor: string | null;
}

const CURSOR_SEPARATOR = "|";

/** Encode `(ts, id)` into the opaque `nextCursor` string. */
export function encodeBlockedEventsCursor(parts: { ts: string; id: string }): string {
    return `${parts.ts}${CURSOR_SEPARATOR}${parts.id}`;
}

/**
 * Decode the opaque cursor back into `(ts, id)`. Returns null on any
 * malformed input — pagination degrades to a fresh first page.
 */
export function decodeBlockedEventsCursor(
    cursor: string | undefined,
): { ts: string; id: string } | null {
    if (cursor === undefined || cursor === "") return null;
    const sep = cursor.indexOf(CURSOR_SEPARATOR);
    if (sep <= 0 || sep === cursor.length - 1) return null;
    return { ts: cursor.slice(0, sep), id: cursor.slice(sep + 1) };
}

/**
 * Per-day cumulative spend for one budget scope. The budget detail page reads
 * this to draw a sparkline against the period's cap. Buckets are UTC days
 * (`date_trunc('day', ts)` in SQL; the in-memory fake mirrors the same).
 *
 * Filters: workspace + scope_type/scope_id (workspace scope skips the scope
 * column predicate) + `status='ok'` + `ts ∈ [from, to)`. Returns one running-
 * total dollar value per day in the window; an empty or zero-length window
 * returns `[]`.
 */
export interface CumulativeSpendDailyQuery {
    readonly workspaceId: string;
    readonly scopeType: "workspace" | "tenant" | "agent" | "workflow";
    readonly scopeId: string | null;
    /** Inclusive lower bound of the period (UTC). */
    readonly from: Date;
    /** Exclusive upper bound of the period (UTC). */
    readonly to: Date;
}

export interface MeteringReadRepository {
    spendSeries(query: SpendSeriesQuery): Promise<readonly SeriesPoint[]>;
    topSpenders(query: TopSpendersQuery): Promise<readonly TopSpenderRow[]>;
    countEvents(query: CountEventsQuery): Promise<number>;
    listDistinctValuesBulk(query: ListDistinctValuesBulkQuery): Promise<DistinctValuesByScope>;
    getLastUsageEventAt(query: LastUsageEventAtQuery): Promise<Date | null>;
    listBlockedEventsForBudget(query: BlockedEventsForBudgetQuery): Promise<BlockedEventsPage>;
    countBlockedEventsForBudget(query: CountBlockedEventsForBudgetQuery): Promise<number>;
    cumulativeSpendDaily(query: CumulativeSpendDailyQuery): Promise<readonly number[]>;
}
