/**
 * Tests for the chart's metric switch.
 *
 * When the /spend dashboard's `status` filter is anything other than `'ok'`,
 * cost is meaningless ($0 everywhere for blocked rows). The chart adapts by
 * graphing `callCount` instead. `buildRows` accepts a `metric` argument to
 * pivot which numeric field feeds the area chart.
 */

import { buildRows } from "@/app/(dashboard)/workspace/[workspaceId]/spend/_lib/build-rows";
import { describe, expect, test } from "bun:test";

describe("buildRows — metric=count", () => {
    test("emits callCount per tag instead of cost", () => {
        const bucket = new Date("2025-05-10T11:00:00Z");
        const { rows } = buildRows(
            [
                { bucket, tag: "tenant-A", costUsd: "0.00000000", callCount: 4 },
                { bucket, tag: "tenant-B", costUsd: "0.00000000", callCount: 7 },
            ],
            { metric: "count" },
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]?.["tenant-A"]).toBe(4);
        expect(rows[0]?.["tenant-B"]).toBe(7);
    });

    test("ranks tags by callCount when metric=count", () => {
        const bucket = new Date("2025-05-10T11:00:00Z");
        const { tags } = buildRows(
            [
                { bucket, tag: "tenant-low", costUsd: "9.99000000", callCount: 1 },
                { bucket, tag: "tenant-high", costUsd: "0.00010000", callCount: 999 },
            ],
            { metric: "count" },
        );

        expect(tags[0]).toBe("tenant-high");
    });

    test("metric=cost remains the default", () => {
        const bucket = new Date("2025-05-10T11:00:00Z");
        const { rows } = buildRows([
            { bucket, tag: "tenant-A", costUsd: "0.10000000", callCount: 4 },
        ]);

        expect(rows[0]?.["tenant-A"]).toBeCloseTo(0.1, 8);
    });
});
