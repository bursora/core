/**
 * Mean helper for the detection pipeline. Empty input is treated as zero
 * so callers can fold without a guard.
 */

import { mean } from "@/lib/detection/stats";
import { describe, expect, test } from "bun:test";

describe("mean", () => {
    test("returns 0 for an empty series", () => {
        expect(mean([])).toBe(0);
    });

    test("computes the arithmetic mean of a numeric series", () => {
        expect(mean([1, 2, 3, 4, 5])).toBeCloseTo(3, 5);
    });

    test("handles a single-element series", () => {
        expect(mean([42])).toBe(42);
    });
});
