/**
 * Pure-math tests for the bill calculator. Math here is the product —
 * wrong math means a customer dispute, so this suite covers the floor,
 * cap, overage line, and the override-gameability case in detail.
 */

import {
    CAP_CENTS,
    FLOOR_CENTS,
    PERCENTAGE,
    calculateMonthlyBill,
    clampPercentage,
    percentageCents,
    rawPercentageCents,
} from "@/lib/ee/billing/calculate-bill";
import { BUNDLE_EVENTS_PER_MONTH } from "@/lib/event-bundle/counter";
import { describe, expect, test } from "bun:test";

describe("rawPercentageCents", () => {
    test("returns the unclamped 0.5% figure", () => {
        // $10,000 spend → 0.5% = $50 = 5000c
        expect(rawPercentageCents(1_000_000)).toBe(5000);
    });

    test("rounds to the nearest cent", () => {
        // 0.5% of 333c = 1.665c → rounds to 2
        expect(rawPercentageCents(333)).toBe(2);
    });

    test("zero input returns zero (no floor)", () => {
        expect(rawPercentageCents(0)).toBe(0);
    });

    test("negative input clamps to zero", () => {
        expect(rawPercentageCents(-1000)).toBe(0);
    });
});

describe("percentageCents", () => {
    test("applies $29 floor when 0.5% is below", () => {
        // Spend of $500 → raw 0.5% = $2.50 → clamped to $29
        expect(percentageCents(50_000)).toBe(FLOOR_CENTS);
    });

    test("returns raw 0.5% inside the envelope", () => {
        // Spend of $10,000 → 0.5% = $50 = 5000c
        expect(percentageCents(1_000_000)).toBe(5000);
    });

    test("clamps to $499 cap at the high end", () => {
        // Spend of $1,000,000 → 0.5% = $5,000 → clamped to $499
        expect(percentageCents(100_000_000)).toBe(CAP_CENTS);
    });

    test("floor still applies when input is zero", () => {
        expect(percentageCents(0)).toBe(FLOOR_CENTS);
    });

    test("floor guards against pricing-override gaming", () => {
        // A workspace that overrode every model to $0 gets the floor anyway.
        expect(percentageCents(0)).toBeGreaterThanOrEqual(FLOOR_CENTS);
        // Even with $5 spend (which would 0.5% = 2.5c), the floor wins.
        expect(percentageCents(500)).toBe(FLOOR_CENTS);
    });
});

describe("clampPercentage", () => {
    test("returns raw when inside envelope", () => {
        expect(clampPercentage(5000, 2900, 49900)).toBe(5000);
    });

    test("clamps to floor when below", () => {
        expect(clampPercentage(100, 2900, 49900)).toBe(2900);
    });

    test("clamps to cap when above", () => {
        expect(clampPercentage(60000, 2900, 49900)).toBe(49900);
    });
});

describe("calculateMonthlyBill", () => {
    test("floor + zero overage at light spend", () => {
        const bill = calculateMonthlyBill({ trackedSpendCents: 0, eventsCount: 0 });
        expect(bill).toEqual({
            percentageCents: FLOOR_CENTS,
            overageCents: 0,
            totalCents: FLOOR_CENTS,
        });
    });

    test("cap + zero overage at huge spend", () => {
        const bill = calculateMonthlyBill({
            trackedSpendCents: 100_000_000,
            eventsCount: 1_000_000,
        });
        expect(bill).toEqual({
            percentageCents: CAP_CENTS,
            overageCents: 0,
            totalCents: CAP_CENTS,
        });
    });

    test("inside envelope: $10K spend, no overage", () => {
        // $10K spend → percentage = $50 (5000c). Events at bundle → 0 overage.
        const bill = calculateMonthlyBill({
            trackedSpendCents: 1_000_000,
            eventsCount: BUNDLE_EVENTS_PER_MONTH,
        });
        expect(bill).toEqual({
            percentageCents: 5000,
            overageCents: 0,
            totalCents: 5000,
        });
    });

    test("percentage + overage stack additively", () => {
        // $50K spend → percentage clamped to $250. +10K events overage → $3.
        const bill = calculateMonthlyBill({
            trackedSpendCents: 5_000_000,
            eventsCount: BUNDLE_EVENTS_PER_MONTH + 10_000,
        });
        expect(bill.percentageCents).toBe(25_000);
        expect(bill.overageCents).toBe(300);
        expect(bill.totalCents).toBe(25_300);
    });

    test("$100K+ caps even with heavy overage", () => {
        const bill = calculateMonthlyBill({
            trackedSpendCents: 10_000_000,
            eventsCount: BUNDLE_EVENTS_PER_MONTH + 100_000,
        });
        expect(bill.percentageCents).toBe(CAP_CENTS);
        // 100K overage events → $30 (3000c)
        expect(bill.overageCents).toBe(3_000);
        expect(bill.totalCents).toBe(CAP_CENTS + 3_000);
    });

    test("PERCENTAGE constant is 0.5%", () => {
        expect(PERCENTAGE).toBe(0.005);
    });
});
