/**
 * Tests for the pure end-of-period projection helper.
 *
 * Both the budget list row and the budget detail view extrapolate spend to
 * the end of the period using the same linear formula. Extracted into
 * `lib/budgeting/projection.ts` so the two call sites share one implementation.
 */

import { projectEndOfPeriod } from "@/lib/budgeting/projection";
import type { BudgetStats } from "@/lib/budgeting/server";
import { describe, expect, test } from "bun:test";

const stats = (overrides: Partial<BudgetStats> = {}): BudgetStats => ({
    usedUsd: 0,
    calls: 0,
    tokens: 0,
    topModel: null,
    periodFromIso: "2025-01-01T00:00:00.000Z",
    periodToIso: "2025-01-31T00:00:00.000Z",
    currentlyBlocking: false,
    firstTrippedAt: null,
    crossingCountThisPeriod: 0,
    ...overrides,
});

describe("projectEndOfPeriod", () => {
    test("returns null when now is at or before period start (zero elapsed)", () => {
        const s = stats();
        const result = projectEndOfPeriod(s, 10, new Date("2025-01-01T00:00:00.000Z"));
        expect(result).toBeNull();
    });

    test("extrapolates linearly when half the period has elapsed", () => {
        const s = stats();
        // Halfway through 30-day period: 2025-01-16T00:00:00Z
        const now = new Date("2025-01-16T00:00:00.000Z");
        const result = projectEndOfPeriod(s, 50, now);
        expect(result).toBeCloseTo(100, 5);
    });

    test("returns the spend itself when now is at or after the period end", () => {
        const s = stats();
        const result = projectEndOfPeriod(s, 75, new Date("2025-01-31T00:00:00.000Z"));
        expect(result).toBeCloseTo(75, 5);
    });

    test("returns null for a zero-length period (total = 0)", () => {
        const s = stats({
            periodFromIso: "2025-01-01T00:00:00.000Z",
            periodToIso: "2025-01-01T00:00:00.000Z",
        });
        const result = projectEndOfPeriod(s, 10, new Date("2025-01-05T00:00:00.000Z"));
        expect(result).toBeNull();
    });

    test("defaults `now` to the current Date when omitted", () => {
        // Smoke: caller can skip `now` and still get a finite number when the
        // period straddles "now". The exact value depends on the clock, so we
        // just assert it's a non-negative finite number.
        const s = stats({
            periodFromIso: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            periodToIso: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        const result = projectEndOfPeriod(s, 10);
        expect(result).not.toBeNull();
        if (result === null) throw new Error("unreachable");
        expect(Number.isFinite(result)).toBe(true);
        expect(result).toBeGreaterThan(0);
    });
});
