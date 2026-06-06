/**
 * The first-event activation marker fires `first_event_received` exactly once
 * per workspace, in O(1), with no per-request ClickHouse COUNT. It is backed by
 * a Redis `SET key NX`: the very first ingest sets the key and reports "newly
 * marked"; every subsequent ingest finds the key already set and reports
 * "already marked", so the beacon never re-fires. Self-host installs (no Redis)
 * report "already marked" so the beacon stays silent and nothing reaches the
 * network.
 */

import {
    markFirstEvent,
    setFirstEventMarkerStoreForTesting,
} from "@/lib/analytics/first-event-marker";
import { afterEach, describe, expect, test } from "bun:test";

function fakeStore() {
    const seen = new Set<string>();
    return {
        store: {
            markIfFirst: async (workspaceId: string): Promise<boolean> => {
                if (seen.has(workspaceId)) return false;
                seen.add(workspaceId);
                return true;
            },
        },
        seen,
    };
}

afterEach(() => {
    setFirstEventMarkerStoreForTesting(null);
});

describe("markFirstEvent", () => {
    test("reports newly-marked on the first call for a workspace", async () => {
        const { store } = fakeStore();
        setFirstEventMarkerStoreForTesting(store);
        expect(await markFirstEvent("ws-1")).toBe(true);
    });

    test("reports already-marked on every subsequent call for the same workspace", async () => {
        const { store } = fakeStore();
        setFirstEventMarkerStoreForTesting(store);
        await markFirstEvent("ws-1");
        expect(await markFirstEvent("ws-1")).toBe(false);
        expect(await markFirstEvent("ws-1")).toBe(false);
    });

    test("tracks each workspace independently", async () => {
        const { store } = fakeStore();
        setFirstEventMarkerStoreForTesting(store);
        await markFirstEvent("ws-1");
        expect(await markFirstEvent("ws-2")).toBe(true);
    });

    test("never fires when no marker store is reachable (self-host stays silent)", async () => {
        setFirstEventMarkerStoreForTesting({ markIfFirst: async () => false });
        expect(await markFirstEvent("ws-1")).toBe(false);
    });
});
