/**
 * Event-bundle primitives.
 *
 * Two collaborators:
 *   - `EventBundleCounterStore` holds the per-(workspace, month) running
 *     count. Redis adapter is production; in-memory mirrors its semantics
 *     for tests.
 *   - `EventBundleUsageRepository` persists the month rollup; used as the
 *     cold store for the Redis counter so a cache loss still reflects
 *     committed usage. Drives the fair-use warning and dashboards.
 */

import "server-only";

export interface EventBundleCount {
    /** Pre-increment events accrued this cycle. */
    readonly priorCount: number;
    /** Post-increment events accrued this cycle. */
    readonly newCount: number;
}

export interface EventBundleCounterStore {
    /**
     * Atomically increment the per-(workspace, month) counter by `n` and
     * return the pre- and post-increment values. `month` is `YYYY-MM`.
     */
    incrementMonth(input: {
        readonly workspaceId: string;
        readonly month: string;
        readonly n: number;
    }): Promise<EventBundleCount>;

    /** Read the current counter without writing. */
    readMonth(input: { readonly workspaceId: string; readonly month: string }): Promise<number>;

    /**
     * Seed the counter from the cold store. Idempotent — implementations
     * SET to `value` (not INCR) so reconciliation doesn't double-count.
     */
    seedMonth(input: {
        readonly workspaceId: string;
        readonly month: string;
        readonly value: number;
    }): Promise<void>;
}

export interface EventBundleMonthRollup {
    readonly eventsCount: number;
}

export interface EventBundleUsageRepository {
    /** Read the cold-store rollup for the cycle. Null when the row is absent. */
    findMonth(input: {
        readonly workspaceId: string;
        readonly month: string;
    }): Promise<EventBundleMonthRollup | null>;

    /**
     * Upsert the rollup to the absolute value from the hot counter. Implementations
     * MUST overwrite, not increment — the caller already aggregated.
     */
    upsertMonth(input: {
        readonly workspaceId: string;
        readonly month: string;
        readonly eventsCount: number;
    }): Promise<void>;
}
