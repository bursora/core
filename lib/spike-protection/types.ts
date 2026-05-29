/**
 * Spike-protection primitives.
 *
 * Two collaborators:
 *   - `SpikeStateStore` holds the per-workspace per-minute counter and the
 *     cooldown timestamp. The Redis adapter is production; the in-memory
 *     fake mirrors its semantics for tests.
 *   - `SpikeSettingsRepository` reads/writes the per-workspace toggle and
 *     threshold multiplier from Postgres.
 *
 * `BaselineSource` lets the middleware delegate "what's this workspace's
 * normal events/min over the last 7 days?" to a pluggable read path —
 * production reads from `usage_events`; tests stub a constant.
 */

import "server-only";

/**
 * Decision returned by the events-ingest spike check. Spike protection is the
 * capacity guard on ingest (burst against the per-workspace 7-day baseline).
 * The event-bundle fair-use cap is alert-only and never blocks, so it has no
 * say here.
 */
export interface SpikeDecision {
    readonly allowed: boolean;
    /** Suggested wait before retrying. Only set on a deny. */
    readonly retryAfterMs?: number;
}

export interface SpikeBucketIncrement {
    /** Pre-increment count inside the current minute. */
    readonly priorCount: number;
    /** Post-increment count inside the current minute. */
    readonly newCount: number;
}

export interface CooldownState {
    /** Epoch ms when the cooldown expires. Zero when no cooldown active. */
    readonly untilMs: number;
}

export interface SpikeStateStore {
    /**
     * Atomically increment the current-minute counter by `n` and return the
     * pre- and post-increment values. The minute is derived from
     * `bucketMs = floor(nowMs / 60_000)`.
     */
    incrementMinute(input: {
        readonly workspaceId: string;
        readonly bucketMs: number;
        readonly n: number;
    }): Promise<SpikeBucketIncrement>;

    /**
     * Mark the workspace as in cooldown until `untilMs`. Subsequent reads
     * via `getCooldown` return that value until it expires.
     */
    setCooldown(input: { readonly workspaceId: string; readonly untilMs: number }): Promise<void>;

    /** Returns the active cooldown end (epoch ms) or zero if none. */
    getCooldown(input: { readonly workspaceId: string }): Promise<CooldownState>;
}

export interface SpikeSettings {
    readonly enabled: boolean;
    readonly thresholdMultiplier: number;
}

export interface SpikeSettingsRepository {
    findByWorkspaceId(workspaceId: string): Promise<SpikeSettings | null>;
    upsert(input: {
        readonly workspaceId: string;
        readonly enabled: boolean;
        readonly thresholdMultiplier: number;
    }): Promise<void>;
}

export interface BaselineSource {
    /**
     * Pull the per-minute event count series for the workspace covering the
     * last 7 days ending at `endMs`. Implementation may downsample (hourly
     * average) to keep the query cheap — the baseline calc is robust to it.
     */
    fetch7DayMinuteSeries(input: {
        readonly workspaceId: string;
        readonly endMs: number;
    }): Promise<readonly number[]>;
}
