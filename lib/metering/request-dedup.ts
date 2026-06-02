/**
 * Request-id dedup guard.
 *
 * ClickHouse `usage_events` is a plain MergeTree with no `ON CONFLICT`, so a
 * retried delivery carrying the same `request_id` would otherwise write (and
 * bill) twice. Idempotency moves to the app layer: before the rows land, this
 * guard records each `(workspace_id, request_id)` in a short-TTL Redis set
 * scoped to the idempotency window. A key seen before is dropped so the caller
 * inserts and counts it exactly once.
 *
 * Standalone and reusable: the metering ingest sink must skip a `request_id`
 * it has already processed, so it imports this module and builds keys via
 * `dedupKey`.
 *
 * Ordering trade-off: keys are marked seen *before* the insert. Concurrent
 * retries then race on the atomic `SET NX`, so only one wins and double-write
 * is impossible. The cost is that an insert failing after its key was marked
 * loses that one event on the retry — under-counting, never double-billing.
 * That matches the "do not double-bill" stance the metering tests encode.
 */

import "server-only";

import type { Redis } from "ioredis";

/** Idempotency window. A retry within this span of the first delivery dedups. */
export const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RequestDedupGuard {
    /**
     * Atomically records each key as seen for the idempotency window and
     * returns the subset that had NOT been seen before. Keys already present
     * (a retried delivery within the window) are excluded so the caller acts on
     * each exactly once. Keys are opaque; callers namespace them via
     * `dedupKey`.
     */
    keepUnseen(keys: readonly string[]): Promise<ReadonlySet<string>>;
}

/**
 * Redis key for a `(workspaceId, requestId)` pair. Scoped by workspace so the
 * same `requestId` reported by two workspaces never collides.
 */
export function dedupKey(workspaceId: string, requestId: string): string {
    return `dedup:reqid:${workspaceId}:${requestId}`;
}

export class RedisRequestDedupGuard implements RequestDedupGuard {
    constructor(
        private readonly redis: Redis,
        private readonly windowMs: number = DEDUP_WINDOW_MS,
    ) {}

    async keepUnseen(keys: readonly string[]): Promise<ReadonlySet<string>> {
        const unique = [...new Set(keys)];
        if (unique.length === 0) return new Set();

        // `SET key 1 PX window NX` per key in one round trip. Redis runs the
        // pipeline in order; each `SET NX` is atomic, so a key duplicated
        // within the batch sets once and the rest read as already-present.
        const pipeline = this.redis.pipeline();
        for (const key of unique) {
            pipeline.set(key, "1", "PX", this.windowMs, "NX");
        }
        const results = await pipeline.exec();
        if (results === null) {
            throw new Error("RedisRequestDedupGuard: pipeline returned no results");
        }

        const fresh = new Set<string>();
        for (let i = 0; i < unique.length; i++) {
            const key = unique[i];
            const entry = results[i];
            if (key === undefined || entry === undefined) continue;
            const [err, value] = entry;
            if (err !== null) throw err;
            // "OK" means the key was absent (first sight); null means it already
            // existed (a retry within the window).
            if (value === "OK") fresh.add(key);
        }
        return fresh;
    }
}
