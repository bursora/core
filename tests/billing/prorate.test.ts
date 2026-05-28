/**
 * Pro-rata math for partial-month billing windows.
 */

import { daysActiveInclusive, daysInUtcMonth, prorateFraction, utcDayDiff } from "@/lib/ee/billing/prorate";
import { describe, expect, test } from "bun:test";

describe("prorateFraction", () => {
    test("full month → 1", () => {
        expect(prorateFraction({ daysActive: 31, daysInMonth: 31 })).toBe(1);
    });

    test("half month → 0.5", () => {
        expect(prorateFraction({ daysActive: 15, daysInMonth: 30 })).toBe(0.5);
    });

    test("clamps active to in-month upper bound", () => {
        expect(prorateFraction({ daysActive: 50, daysInMonth: 30 })).toBe(1);
    });

    test("clamps active to zero lower bound", () => {
        expect(prorateFraction({ daysActive: -5, daysInMonth: 30 })).toBe(0);
    });

    test("zero in-month returns zero (defensive)", () => {
        expect(prorateFraction({ daysActive: 5, daysInMonth: 0 })).toBe(0);
    });
});

describe("daysInUtcMonth", () => {
    test("January has 31", () => {
        expect(daysInUtcMonth(new Date("2025-01-15T00:00:00Z"))).toBe(31);
    });

    test("February (non-leap) has 28", () => {
        expect(daysInUtcMonth(new Date("2025-02-15T00:00:00Z"))).toBe(28);
    });

    test("February (leap year) has 29", () => {
        expect(daysInUtcMonth(new Date("2024-02-15T00:00:00Z"))).toBe(29);
    });

    test("April has 30", () => {
        expect(daysInUtcMonth(new Date("2025-04-15T00:00:00Z"))).toBe(30);
    });
});

describe("daysActiveInclusive", () => {
    test("same day → 1", () => {
        const d = new Date("2025-01-15T12:00:00Z");
        expect(daysActiveInclusive(d, d)).toBe(1);
    });

    test("two consecutive days → 2", () => {
        expect(
            daysActiveInclusive(new Date("2025-01-15T23:00:00Z"), new Date("2025-01-16T00:00:00Z")),
        ).toBe(2);
    });

    test("end before start → 0", () => {
        expect(
            daysActiveInclusive(new Date("2025-01-15T00:00:00Z"), new Date("2025-01-14T00:00:00Z")),
        ).toBe(0);
    });

    test("a week → 7", () => {
        expect(
            daysActiveInclusive(new Date("2025-01-01T00:00:00Z"), new Date("2025-01-07T23:59:59Z")),
        ).toBe(7);
    });
});

describe("utcDayDiff", () => {
    // Half-open [from, to) count of whole UTC calendar days. `to` is the
    // exclusive period end (first-of-next-month 00:00 UTC), so no 1ms hack.
    test("first of month to first of next month → full month", () => {
        expect(utcDayDiff(new Date("2025-01-01T00:00:00Z"), new Date("2025-02-01T00:00:00Z"))).toBe(
            31,
        );
    });

    test("last day of month to first of next month → 1 day", () => {
        expect(utcDayDiff(new Date("2025-01-31T23:59:59Z"), new Date("2025-02-01T00:00:00Z"))).toBe(
            1,
        );
    });

    test("mid-month signup counts day of signup through end exclusive", () => {
        // Jan 17 .. Feb 1) → days 17..31 = 15.
        expect(utcDayDiff(new Date("2025-01-17T12:00:00Z"), new Date("2025-02-01T00:00:00Z"))).toBe(
            15,
        );
    });

    test("DST-transition month still counts whole calendar days (no hour drift)", () => {
        // US spring-forward is Mar 9, 2025 (a 23-hour local day). A naive
        // millisecond/86_400_000 diff would undercount; UTC day numbers keep
        // it exact at 31.
        expect(utcDayDiff(new Date("2025-03-01T00:00:00Z"), new Date("2025-04-01T00:00:00Z"))).toBe(
            31,
        );
    });

    test("end at or before start → 0", () => {
        expect(utcDayDiff(new Date("2025-02-01T00:00:00Z"), new Date("2025-01-01T00:00:00Z"))).toBe(
            0,
        );
        expect(utcDayDiff(new Date("2025-01-15T00:00:00Z"), new Date("2025-01-15T23:00:00Z"))).toBe(
            0,
        );
    });
});
