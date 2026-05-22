/**
 * Tests for buildRows — the pure aggregation behind the spend chart's
 * tooltip and area data.
 *
 * Covers the `__calls` aggregation across multiple tags in the same bucket,
 * which the tooltip surfaces as the "Calls" row.
 */

import { buildRows } from "@/app/(dashboard)/workspace/[workspaceId]/spend/_lib/build-rows";
import { describe, expect, test } from "bun:test";

describe("buildRows", () => {
    test("aggregates __calls across tags sharing a bucket", () => {
        const bucket = new Date("2025-05-10T11:00:00Z");
        const { rows } = buildRows([
            { bucket, tag: "tenant-A", costUsd: "0.10000000", callCount: 3 },
            { bucket, tag: "tenant-B", costUsd: "0.20000000", callCount: 5 },
        ]);

        expect(rows).toHaveLength(1);
        expect(rows[0]?.__calls).toBe(8);
    });

    test("returns empty rows for empty input", () => {
        const { rows, tags, hasOther } = buildRows([]);
        expect(rows).toEqual([]);
        expect(tags).toEqual([]);
        expect(hasOther).toBe(false);
    });

    test("keeps __calls bucket-local, not summed across buckets", () => {
        const b1 = new Date("2025-05-10T11:00:00Z");
        const b2 = new Date("2025-05-10T12:00:00Z");
        const { rows } = buildRows([
            { bucket: b1, tag: "tenant-A", costUsd: "0.10000000", callCount: 3 },
            { bucket: b2, tag: "tenant-A", costUsd: "0.10000000", callCount: 7 },
        ]);

        expect(rows).toHaveLength(2);
        expect(rows[0]?.__calls).toBe(3);
        expect(rows[1]?.__calls).toBe(7);
    });
});
