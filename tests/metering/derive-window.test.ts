/**
 * Tests for the deriveWindow helper.
 *
 * Bucket-size policy is derived from the span (to − from):
 *   - span <  2h → 5min   (300s)
 *   - span <  2d → 1h     (3600s)
 *   - else       → 1d     (86400s)
 *
 * windowStart/windowEnd are the verbatim from/to inputs.
 */

import { deriveWindow } from "@/lib/metering/get-spend-series.usecase";
import { describe, expect, test } from "bun:test";

const minutes = (n: number) => n * 60 * 1000;
const hours = (n: number) => n * 60 * 60 * 1000;
const days = (n: number) => n * 24 * 60 * 60 * 1000;

describe("deriveWindow", () => {
    test("span of 1h uses 5min buckets", () => {
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - hours(1));
        const w = deriveWindow({ from, to });
        expect(w.windowStart).toEqual(from);
        expect(w.windowEnd).toEqual(to);
        expect(w.bucketSeconds).toBe(300);
    });

    test("span just under 2h uses 5min buckets", () => {
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - (hours(2) - minutes(1)));
        expect(deriveWindow({ from, to }).bucketSeconds).toBe(300);
    });

    test("span of exactly 2h uses 1h buckets", () => {
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - hours(2));
        expect(deriveWindow({ from, to }).bucketSeconds).toBe(3600);
    });

    test("span of 24h uses 1h buckets", () => {
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - hours(24));
        expect(deriveWindow({ from, to }).bucketSeconds).toBe(3600);
    });

    test("span just under 2d uses 1h buckets", () => {
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - (days(2) - minutes(1)));
        expect(deriveWindow({ from, to }).bucketSeconds).toBe(3600);
    });

    test("span of exactly 2d uses 1d buckets", () => {
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - days(2));
        expect(deriveWindow({ from, to }).bucketSeconds).toBe(86400);
    });

    test("span of 7d uses 1d buckets", () => {
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - days(7));
        expect(deriveWindow({ from, to }).bucketSeconds).toBe(86400);
    });

    test("span of 30d uses 1d buckets", () => {
        const to = new Date("2025-05-10T12:00:00Z");
        const from = new Date(to.getTime() - days(30));
        expect(deriveWindow({ from, to }).bucketSeconds).toBe(86400);
    });
});
