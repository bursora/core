/**
 * Per-process baseline cache. The 7-day query is expensive; recomputing it
 * on every ingest is wasteful when the baseline barely moves minute-to-minute.
 *
 * Cache TTL is 15 minutes — enough to amortize cost without letting a real
 * traffic shift leave the baseline stuck. Bounded LRU at 10k workspaces so
 * cold entries can't accumulate on a long-lived container.
 */

import "server-only";

import { LruCache } from "../lru-cache";
import { calculate7DayWeightedBaseline } from "./baseline-calculator";
import type { BaselineSource } from "./types";

const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 10_000;

const cache = new LruCache<string, number>(MAX_ENTRIES);
const inflight = new Map<string, Promise<number>>();

export async function getCachedBaseline(input: {
    readonly workspaceId: string;
    readonly nowMs: number;
    readonly source: BaselineSource;
}): Promise<number> {
    const cached = cache.get(input.workspaceId);
    if (cached && input.nowMs - cached.storedAtMs < TTL_MS) {
        return cached.value;
    }
    // Single-flight: concurrent callers on the same workspace share one
    // Postgres aggregate. Without this, N parallel ingest requests after a
    // cache miss each fire the expensive 7-day query.
    const existing = inflight.get(input.workspaceId);
    if (existing !== undefined) return existing;
    const promise = (async () => {
        try {
            const series = await input.source.fetch7DayMinuteSeries({
                workspaceId: input.workspaceId,
                endMs: input.nowMs,
            });
            const value = calculate7DayWeightedBaseline(series);
            cache.set(input.workspaceId, value, input.nowMs);
            return value;
        } finally {
            inflight.delete(input.workspaceId);
        }
    })();
    inflight.set(input.workspaceId, promise);
    return promise;
}

/** Clear the cache. Test-only. */
export function resetBaselineCache(): void {
    cache.clear();
    inflight.clear();
}
