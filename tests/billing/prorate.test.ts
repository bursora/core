/**
 * Pro-rata math for partial-month billing windows.
 */

import { daysActiveInclusive, daysInUtcMonth, prorateFraction } from "@/lib/ee/billing/prorate";
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
