import { computePeakDay } from "@/app/(dashboard)/workspace/[workspaceId]/spend/_lib/peak-day";
import type { SeriesPoint } from "@/lib/metering/spend-series";
import { describe, expect, test } from "bun:test";

const point = (bucket: string, costUsd: string, callCount = 1, tag = "acme"): SeriesPoint => ({
    bucket: new Date(bucket),
    tag,
    costUsd,
    callCount,
});

describe("computePeakDay", () => {
    test("returns null for empty series", () => {
        expect(computePeakDay([])).toBeNull();
    });

    test("returns null when every point is zero", () => {
        expect(
            computePeakDay([
                point("2025-05-08T00:00:00Z", "0"),
                point("2025-05-09T00:00:00Z", "0.00000000"),
            ]),
        ).toBeNull();
    });

    test("sums same-UTC-day buckets across tags", () => {
        const peak = computePeakDay([
            point("2025-05-08T01:00:00Z", "1.00", 1, "a"),
            point("2025-05-08T13:00:00Z", "2.50", 1, "b"),
            point("2025-05-09T01:00:00Z", "3.00", 1, "a"),
        ]);
        expect(peak?.date.toISOString()).toBe("2025-05-08T00:00:00.000Z");
        expect(peak?.total).toBe(3.5);
    });

    test("picks the highest-total UTC date", () => {
        const peak = computePeakDay([
            point("2025-05-08T00:00:00Z", "10.00"),
            point("2025-05-09T00:00:00Z", "25.00"),
            point("2025-05-10T00:00:00Z", "5.00"),
        ]);
        expect(peak?.date.toISOString()).toBe("2025-05-09T00:00:00.000Z");
        expect(peak?.total).toBe(25);
    });
});
