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

export interface SpendAggregatorQuery {
    readonly workspaceId: string;
    readonly scopeType: ScopeType;
    readonly scopeId: string | null;
    /** Inclusive lower bound of the resolved budget window (UTC). */
    readonly from: Date;
    /** Exclusive upper bound of the resolved budget window (UTC). */
    readonly to: Date;
}

export interface SpendAggregator {
    getSpendForScopePeriod(query: SpendAggregatorQuery): Promise<number>;
}
