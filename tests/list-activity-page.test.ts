/**
 * Tests for listActivityPageUseCase — filtered + cursor-paginated activity
 * powering the workspace Settings → Activity tab.
 *
 * Behaviors:
 *   1. kind filter narrows the merged stream.
 *   2. severity filter applies to alert rows.
 *   3. from/to range filter is honoured.
 *   4. Cursor pagination returns nextCursor when more items exist; cursor
 *      input skips already-emitted rows.
 *   5. Empty cursor when result fits within limit.
 */

import type { AnomalyAlert } from "@/lib/detection";
import { listActivityPageUseCase } from "@/lib/metering";
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

describe("listActivityPageUseCase", () => {
    test("kind filter returns only matching items", async () => {
        const out = await listActivityPageUseCase({
            workspaceId: WORKSPACE,
            now: NOW,
            filters: { kind: "alert_raised" },
            fetchEventBuckets: async () => [{ at: new Date("2025-05-10T10:00:00Z"), count: 5 }],
            fetchAlerts: async () => [
                alert({ raisedAt: new Date("2025-05-10T11:30:00Z"), reason: "tenant spike" }),
            ],
            fetchKeyEvents: async () => [
                {
                    id: "key-1234abcd",
                    createdAt: new Date("2025-05-10T09:00:00Z"),
                    revokedAt: null,
                },
            ],
        });

        expect(out.items.map((i) => i.kind)).toEqual(["alert_raised"]);
        expect(out.nextCursor).toBeNull();
    });

    test("severity filter drops alerts that do not match", async () => {
        const out = await listActivityPageUseCase({
            workspaceId: WORKSPACE,
            now: NOW,
            filters: { severity: "critical" },
            fetchEventBuckets: async () => [],
            fetchAlerts: async () => [
                alert({ raisedAt: new Date("2025-05-10T11:30:00Z"), severity: "warning" }),
                alert({ raisedAt: new Date("2025-05-10T11:45:00Z"), severity: "critical" }),
            ],
            fetchKeyEvents: async () => [],
        });

        expect(out.items.length).toBe(1);
        expect(out.items[0]?.severity).toBe("critical");
    });

    test("from/to bounds drop items outside the explicit range", async () => {
        const out = await listActivityPageUseCase({
            workspaceId: WORKSPACE,
            now: NOW,
            filters: {
                from: new Date("2025-05-10T11:00:00Z"),
                to: new Date("2025-05-10T11:59:59Z"),
            },
            fetchEventBuckets: async () => [
                { at: new Date("2025-05-10T10:00:00Z"), count: 5 }, // before
                { at: new Date("2025-05-10T11:30:00Z"), count: 2 }, // in range
            ],
            fetchAlerts: async () => [],
            fetchKeyEvents: async () => [],
        });

        expect(out.items.length).toBe(1);
        expect(out.items[0]?.at.toISOString()).toBe("2025-05-10T11:30:00.000Z");
    });

    test("returns nextCursor when more items exist beyond limit", async () => {
        const buckets = Array.from({ length: 10 }, (_, i) => ({
            at: new Date(NOW.getTime() - i * 60 * 60 * 1000),
            count: 1,
        }));
        const out = await listActivityPageUseCase({
            workspaceId: WORKSPACE,
            now: NOW,
            limit: 3,
            fetchEventBuckets: async () => buckets,
            fetchAlerts: async () => [],
            fetchKeyEvents: async () => [],
        });

        expect(out.items.length).toBe(3);
        expect(out.nextCursor).not.toBeNull();
    });

    test("cursor input skips already-returned rows", async () => {
        const buckets = Array.from({ length: 5 }, (_, i) => ({
            at: new Date(NOW.getTime() - i * 60 * 60 * 1000),
            count: 1,
        }));

        const first = await listActivityPageUseCase({
            workspaceId: WORKSPACE,
            now: NOW,
            limit: 2,
            fetchEventBuckets: async () => buckets,
            fetchAlerts: async () => [],
            fetchKeyEvents: async () => [],
        });

        expect(first.items.length).toBe(2);
        expect(first.nextCursor).not.toBeNull();

        const second = await listActivityPageUseCase({
            workspaceId: WORKSPACE,
            now: NOW,
            limit: 2,
            cursor: first.nextCursor,
            fetchEventBuckets: async () => buckets,
            fetchAlerts: async () => [],
            fetchKeyEvents: async () => [],
        });

        expect(second.items.length).toBe(2);
        // distinct page: second page's first item is older than first page's last
        const firstLastTs = first.items[first.items.length - 1]!.at.getTime();
        const secondFirstTs = second.items[0]!.at.getTime();
        expect(secondFirstTs).toBeLessThan(firstLastTs);
    });

    test("nextCursor is null when results fit within limit", async () => {
        const out = await listActivityPageUseCase({
            workspaceId: WORKSPACE,
            now: NOW,
            limit: 50,
            fetchEventBuckets: async () => [{ at: new Date("2025-05-10T11:00:00Z"), count: 3 }],
            fetchAlerts: async () => [],
            fetchKeyEvents: async () => [],
        });
        expect(out.items.length).toBe(1);
        expect(out.nextCursor).toBeNull();
    });
});
