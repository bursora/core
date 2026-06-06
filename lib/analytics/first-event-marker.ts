/**
 * One-shot "first event" activation marker.
 *
 * The events ingest hot path must detect a workspace's very first event in
 * O(1), without a per-request ClickHouse COUNT over an ever-growing partition.
 * The marker is a single Redis key per workspace, set with `SET key NX`: the
 * first ingest sets it and reports "newly marked"; every later ingest finds it
 * already set and reports "already marked". So `first_event_received` fires
 * exactly once per workspace, then self-suppresses with no further work.
 *
 * Self-host (no `REDIS_URL`) keeps the beacon silent: the default store reports
 * "already marked" without touching the network, matching the analytics
 * surface's self-host-clean contract.
 */

import "server-only";

import { env } from "@/lib/env";
import { redisClient } from "@/lib/redis/client";

export interface FirstEventMarkerStore {
    /**
     * Atomically claim the first-event marker for `workspaceId`. Returns `true`
     * only when this call is the one that set it; `false` if it was already
     * marked or the marker can't be persisted.
     */
    markIfFirst(workspaceId: string): Promise<boolean>;
}

/** 90-day TTL: long past activation, so a re-activated stale key can't re-fire. */
const MARKER_TTL_SECONDS = 90 * 24 * 60 * 60;

function markerKey(workspaceId: string): string {
    return `analytics:first-event:${workspaceId}`;
}

function redisFirstEventMarkerStore(): FirstEventMarkerStore {
    return {
        async markIfFirst(workspaceId) {
            const url = env().REDIS_URL;
            if (url.length === 0) return false;
            const result = await redisClient(url).set(
                markerKey(workspaceId),
                "1",
                "EX",
                MARKER_TTL_SECONDS,
                "NX",
            );
            return result === "OK";
        },
    };
}

let testOverride: FirstEventMarkerStore | null = null;

export function setFirstEventMarkerStoreForTesting(store: FirstEventMarkerStore | null): void {
    testOverride = store;
}

/**
 * Returns `true` exactly once per workspace — on the ingest that lands its very
 * first event — and `false` thereafter. Swallows store errors as "already
 * marked" so a Redis hiccup never blocks ingest or double-fires the beacon.
 */
export async function markFirstEvent(workspaceId: string): Promise<boolean> {
    const store = testOverride ?? redisFirstEventMarkerStore();
    try {
        return await store.markIfFirst(workspaceId);
    } catch {
        // Best-effort. A failed marker write must never surface to the ingest
        // caller; treat it as "already marked" so the beacon stays silent.
        return false;
    }
}
