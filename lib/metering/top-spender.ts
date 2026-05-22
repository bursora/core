/**
 * Top-spenders read model. Consumed by the dashboard table view.
 */

export interface TopSpender {
    /** The facet value (tenant/agent/workflow/model), or `(untagged)`. */
    readonly tag: string;
    /** Total cost in the selected range, as a fixed-precision string. */
    readonly costUsd: string;
    /** Number of usage events aggregated into this row. */
    readonly callCount: number;
    /**
     * Count of `status='blocked'` rows for this tag in the window. Always
     * populated regardless of the query's `status` filter.
     */
    readonly blockedCount: number;
}
