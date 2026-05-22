/**
 * Unit tests for the `isBudgetCurrentlyBlocking` predicate.
 *
 * The predicate gates the red BLOCKING badge on /budgets and is shared
 * downstream by the incident-state and banner surfaces. It is pure: mode +
 * usedUsd + capUsd in, boolean out. No DB, no clock.
 */

import { isBudgetCurrentlyBlocking } from "@/lib/budgeting/server";
import { describe, expect, test } from "bun:test";

describe("isBudgetCurrentlyBlocking", () => {
    test("block mode with spend at cap is blocking", () => {
        expect(isBudgetCurrentlyBlocking("block", 100, 100)).toBe(true);
    });

    test("block mode with spend over cap is blocking", () => {
        expect(isBudgetCurrentlyBlocking("block", 250, 100)).toBe(true);
    });

    test("block mode with spend under cap is not blocking", () => {
        expect(isBudgetCurrentlyBlocking("block", 99.99, 100)).toBe(false);
    });

    test("notify mode is never blocking even over cap", () => {
        expect(isBudgetCurrentlyBlocking("notify", 500, 100)).toBe(false);
    });

    test("throttle mode is never blocking even over cap", () => {
        expect(isBudgetCurrentlyBlocking("throttle", 500, 100)).toBe(false);
    });

    test("zero cap with any positive spend in block mode is blocking", () => {
        expect(isBudgetCurrentlyBlocking("block", 0.01, 0)).toBe(true);
    });

    test("zero cap with zero spend in block mode is blocking (cap is zero - every call breaches it)", () => {
        expect(isBudgetCurrentlyBlocking("block", 0, 0)).toBe(true);
    });
});
