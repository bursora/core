/**
 * Tests for listActivityUseCase — the aggregator that powers the activity
 * drawer. Behaviors:
 *   1. Empty when all sources return nothing.
 *   2. Multi-source items merged and sorted newest first.
 *   3. Items outside the window are dropped (key issued/revoked > 7d ago).
 *   4. limit caps the merged result.
 */

import type { AnomalyAlert } from "@/lib/detection";
import { listActivityUseCase } from "@/lib/metering";
import { describe, expect, test } from "bun:test";

const NOW = new Date("2025-05-10T12:00:00Z");
const WORKSPACE = "ws-a";

const alert = (overrides: Partial<AnomalyAlert> = {}): AnomalyAlert => {
    const raisedAt = overrides.raisedAt ?? NOW;
    return {
        kind: "anomaly",
        scope: { workspaceId: WORKSPACE, tenantId: null, agentId: null },
        reason: "spike",
        deviation: 4.5,
        severity: "warning",
        raisedAt,
        windowStart: raisedAt,
        windowEnd: new Date(raisedAt.getTime() + 5 * 60_000),
        windowCostUsd: 0.05,
        ...overrides,
    };
};

describe("listActivityUseCase", () => {
    test("returns empty array when all sources are empty", async () => {
        const out = await listActivityUseCase({
            workspaceId: WORKSPACE,
            now: NOW,
            fetchEventBuckets: async () => [],
            fetchAlerts: async () => [],
            fetchKeyEvents: async () => [],
        });
        expect(out).toEqual([]);
    });

    test("merges items from all sources, newest first", async () => {
        const out = await listActivityUseCase({
            workspaceId: WORKSPACE,
            now: NOW,
            fetchEventBuckets: async () => [{ at: new Date("2025-05-10T10:00:00Z"), count: 5 }],
            fetchAlerts: async () => [
                alert({
                    reason: "tenant spike",
                    raisedAt: new Date("2025-05-10T11:30:00Z"),
                    severity: "critical",
                }),
            ],
            fetchKeyEvents: async () => [
                {
                    id: "key-1234abcd",
                    createdAt: new Date("2025-05-10T09:00:00Z"),
                    revokedAt: new Date("2025-05-10T11:55:00Z"),
                },
            ],
        });

        expect(out.map((i) => i.kind)).toEqual([
            "key_revoked",
            "alert_raised",
            "event_ingested",
            "key_issued",
        ]);
        expect(out[1]?.severity).toBe("critical");
        expect(out[0]?.summary).toBe("Key ...abcd revoked");
    });

    test("drops zero-count event buckets and pre-window key events", async () => {
        const old = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
        const out = await listActivityUseCase({
            workspaceId: WORKSPACE,
            now: NOW,
            fetchEventBuckets: async () => [
                { at: new Date("2025-05-10T10:00:00Z"), count: 0 },
                { at: new Date("2025-05-10T11:00:00Z"), count: 3 },
            ],
            fetchAlerts: async () => [],
            fetchKeyEvents: async () => [{ id: "key-old00000", createdAt: old, revokedAt: null }],
        });
        expect(out.length).toBe(1);
        expect(out[0]?.kind).toBe("event_ingested");
        expect(out[0]?.summary).toBe("3 events");
    });

    test("clamps future event-bucket timestamps to now", async () => {
        const future = new Date(NOW.getTime() + 21_000);
        const out = await listActivityUseCase({
            workspaceId: WORKSPACE,
            now: NOW,
            fetchEventBuckets: async () => [{ at: future, count: 2 }],
            fetchAlerts: async () => [],
            fetchKeyEvents: async () => [],
        });
        expect(out.length).toBe(1);
        expect(out[0]?.kind).toBe("event_ingested");
        expect(out[0]?.at.getTime()).toBe(NOW.getTime());
    });

    test("respects limit cap on merged stream", async () => {
        const buckets = Array.from({ length: 80 }, (_, i) => ({
            at: new Date(NOW.getTime() - i * 60 * 60 * 1000),
            count: 1,
        }));
        const out = await listActivityUseCase({
            workspaceId: WORKSPACE,
            now: NOW,
            limit: 10,
            fetchEventBuckets: async () => buckets,
            fetchAlerts: async () => [],
            fetchKeyEvents: async () => [],
        });
        expect(out.length).toBe(10);
        // ordering: newest first
        expect(out[0]?.at.getTime()).toBeGreaterThan(out[9]!.at.getTime());
    });
});
