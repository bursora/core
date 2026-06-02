/**
 * Unified spend read port.
 *
 * Both budgeting and the metering dashboards aggregate `usage_events.cost_usd`
 * grouped by scope/period/facet. This port collapses the two query shapes
 * into one place so the WHERE clause (workspace + filters + status + window)
 * stays in lockstep.
 *
 * `getSpendForScope` returns a single USD total for one (workspace, scope,
 * window). It powers the budgeting decision read path and the budget
 * dashboard's per-budget spend.
 *
 * `getSpendSeries` returns raw `SeriesPoint` rows grouped by (bucket, tag).
 * It powers the spend-over-time chart on the metering dashboard.
 *
 * Status is REQUIRED on both methods — callers pick which class of rows
 * (`'ok'`, `'blocked'`, or `'both'`) they want. This matches the boundary
 * contract on `buildClickHouseMeteringWhere`.
 */

import type { ScopeType } from "@/lib/budgeting/budget";
import type {
    MeteringFilters,
    MeteringStatusFilter,
} from "@/lib/metering/metering-read.repository";
import type { Facet, SeriesPoint } from "@/lib/metering/spend-series";

export interface GetSpendForScopeInput {
    readonly workspaceId: string;
    /** `'workspace'` skips the scope-column predicate. */
    readonly scopeType: ScopeType;
    /** `null` skips the scope-column predicate. */
    readonly scopeId: string | null;
    /** Inclusive lower bound of the window (UTC). */
    readonly from: Date;
    /** Exclusive upper bound of the window (UTC). */
    readonly to: Date;
    readonly status: MeteringStatusFilter;
    readonly filters?: MeteringFilters;
}

export interface GetSpendSeriesInput {
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
    readonly status: MeteringStatusFilter;
    readonly filters?: MeteringFilters;
}

export interface SpendRepository {
    getSpendForScope(input: GetSpendForScopeInput): Promise<number>;
    getSpendSeries(input: GetSpendSeriesInput): Promise<readonly SeriesPoint[]>;
}
