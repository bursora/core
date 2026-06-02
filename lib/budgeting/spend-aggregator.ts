/**
 * SpendAggregator — application-side port for the read path.
 *
 * `getSpendForScopePeriod` is called once per matching budget row by
 * decideBudget; returns committed spend in the half-open window.
 *
 * Returns a `number` (USD float). Precision for this read path is acceptable
 * because budgets are denominated in dollars, not micro-cents.
 */

import type { ScopeType } from "./budget";
import type { Period } from "./period";

export interface SpendAggregatorQuery {
    readonly workspaceId: string;
    readonly scopeType: ScopeType;
    readonly scopeId: string | null;
    readonly from: Date;
    readonly to: Date;
    /**
     * Budget period for this window. The counter-backed adapter uses it to
     * address the right spend counter key; a window-only caller (dashboard
     * headroom) omits it and the adapter recovers it from the window duration.
     */
    readonly period?: Period;
    /**
     * Wall clock for this preflight. The counter-backed adapter passes it to
     * select the current window; a window-only caller omits it and the adapter
     * falls back to the window start.
     */
    readonly now?: Date;
}

export interface SpendAggregator {
    getSpendForScopePeriod(query: SpendAggregatorQuery): Promise<number>;
    /**
     * Batched variant. Resolves spend totals for many `(scopeType, scopeId,
     * from, to)` tuples sharing one workspace. Order of the returned array
     * matches the input items. Implementations group by (period, scopeType)
     * so the underlying read collapses to one SQL per group.
     *
     * Optional: implementations may opt out (returning `undefined`-marked
     * support); callers fall back to repeated `getSpendForScopePeriod` calls.
     */
    getSpendForScopePeriodBatch?(query: {
        readonly workspaceId: string;
        readonly items: readonly Omit<SpendAggregatorQuery, "workspaceId">[];
    }): Promise<readonly number[]>;
}
