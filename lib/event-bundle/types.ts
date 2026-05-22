/**
 * Event-bundle primitives.
 *
 * Two collaborators:
 *   - `EventBundleCounterStore` holds the per-(workspace, month) running
 *     count. Redis adapter is production; in-memory mirrors its semantics
 *     for tests.
 *   - `EventBundleSettingsRepository` reads/writes the per-workspace hard
 *     cap from Postgres.
 *   - `EventBundleUsageRepository` persists the month rollup; used as the
 *     cold store and as the billing source for overage.
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

export interface EventBundleSettings {
    /** Null disables the hard cap entirely. */
    readonly hardCapUsdCents: number | null;
}

export interface EventBundleSettingsRepository {
    findByWorkspaceId(workspaceId: string): Promise<EventBundleSettings | null>;
    upsert(input: {
        readonly workspaceId: string;
        readonly hardCapUsdCents: number | null;
    }): Promise<void>;
}

export interface EventBundleMonthRollup {
    readonly eventsCount: number;
    readonly overageCents: number;
}

export interface EventBundleUsageRepository {
    /** Read the cold-store rollup for the cycle. Null when the row is absent. */
    findMonth(input: {
        readonly workspaceId: string;
        readonly month: string;
    }): Promise<EventBundleMonthRollup | null>;

    /**
     * Upsert the rollup to the absolute values from the hot counter. Implementations
     * MUST overwrite, not increment — the caller already aggregated.
     */
    upsertMonth(input: {
        readonly workspaceId: string;
        readonly month: string;
        readonly eventsCount: number;
        readonly overageCents: number;
    }): Promise<void>;
}
