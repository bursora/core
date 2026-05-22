/**
 * Pure-logic tests for the Sparkline normalization helpers. Recharts
 * rendering is exercised in the browser; here we verify the data shaping
 * function handles empty and single-point inputs without exploding.
 */

import { sparklinePoints } from "@/components/ui/sparkline-data";
import { describe, expect, test } from "bun:test";

describe("sparklinePoints", () => {
    test("returns an empty array for empty input", () => {
        expect(sparklinePoints([])).toEqual([]);
    });

    test("returns a single point shaped for recharts", () => {
        expect(sparklinePoints([5])).toEqual([{ i: 0, v: 5 }]);
    });

    test("indexes each value by position", () => {
        expect(sparklinePoints([1, 2, 3])).toEqual([
            { i: 0, v: 1 },
            { i: 1, v: 2 },
            { i: 2, v: 3 },
        ]);
    });
});
