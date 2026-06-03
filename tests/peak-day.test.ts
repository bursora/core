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
        expect(computePeakDay([], "UTC")).toBeNull();
    });

    test("returns null when every point is zero", () => {
        expect(
            computePeakDay(
                [point("2025-05-08T00:00:00Z", "0"), point("2025-05-09T00:00:00Z", "0.00000000")],
                "UTC",
            ),
        ).toBeNull();
    });

    test("sums same-day buckets across tags (UTC)", () => {
        const peak = computePeakDay(
            [
                point("2025-05-08T01:00:00Z", "1.00", 1, "a"),
                point("2025-05-08T13:00:00Z", "2.50", 1, "b"),
                point("2025-05-09T01:00:00Z", "3.00", 1, "a"),
            ],
            "UTC",
        );
        expect(peak?.date.toISOString()).toBe("2025-05-08T00:00:00.000Z");
        expect(peak?.total).toBe(3.5);
    });

    test("picks the highest-total date (UTC)", () => {
        const peak = computePeakDay(
            [
                point("2025-05-08T00:00:00Z", "10.00"),
                point("2025-05-09T00:00:00Z", "25.00"),
                point("2025-05-10T00:00:00Z", "5.00"),
            ],
            "UTC",
        );
        expect(peak?.date.toISOString()).toBe("2025-05-09T00:00:00.000Z");
        expect(peak?.total).toBe(25);
    });

    test("buckets by the viewer's local day, not UTC", () => {
        // In Tirane (+02:00), 2025-05-08T23:30Z is already May 9 local, so it
        // groups with the May 9 local day, not May 8 UTC.
        const peak = computePeakDay(
            [
                point("2025-05-08T12:00:00Z", "1.00"),
                point("2025-05-08T23:30:00Z", "4.00"),
                point("2025-05-09T08:00:00Z", "2.00"),
            ],
            "Europe/Tirane",
        );
        // May 9 local total = 4.00 (23:30Z) + 2.00 (08:00Z) = 6.00; its start is
        // May 8 22:00 UTC.
        expect(peak?.date.toISOString()).toBe("2025-05-08T22:00:00.000Z");
        expect(peak?.total).toBe(6);
    });
});
