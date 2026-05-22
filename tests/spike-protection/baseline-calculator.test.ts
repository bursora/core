import { calculate7DayWeightedBaseline } from "@/lib/spike-protection/baseline-calculator";
import { describe, expect, test } from "bun:test";

const MINUTES_PER_DAY = 24 * 60;
const SEVEN_DAYS = 7 * MINUTES_PER_DAY;

describe("calculate7DayWeightedBaseline", () => {
    test("returns 0 for empty input", () => {
        expect(calculate7DayWeightedBaseline([])).toBe(0);
    });

    test("returns 0 for an all-zero series", () => {
        const zeros = new Array<number>(SEVEN_DAYS).fill(0);
        expect(calculate7DayWeightedBaseline(zeros)).toBe(0);
    });

    test("flat series yields the mean", () => {
        const series = new Array<number>(SEVEN_DAYS).fill(4);
        expect(calculate7DayWeightedBaseline(series)).toBeCloseTo(4);
    });

    test("recent traffic weighs heavier than older traffic", () => {
        // 6 days at 1 event/min, last day at 10 events/min. The naive mean
        // would be ~2.28; the weighted mean should be higher.
        const series = new Array<number>(SEVEN_DAYS).fill(1);
        for (let i = 6 * MINUTES_PER_DAY; i < SEVEN_DAYS; i++) {
            series[i] = 10;
        }
        const weighted = calculate7DayWeightedBaseline(series);
        expect(weighted).toBeGreaterThan(2.28);
        expect(weighted).toBeLessThan(10);
    });

    test("short series is padded with zeros at the start", () => {
        // Only one day of traffic at 5 events/min — the older 6 days are
        // padded with zeros. The weighted average must reflect that.
        const series = new Array<number>(MINUTES_PER_DAY).fill(5);
        const value = calculate7DayWeightedBaseline(series);
        // Total weight 34, day-0 (newest) carries weight 10 with value 5.
        // Other days carry weight 24 with value 0 → (10*5 + 24*0) / 34.
        expect(value).toBeCloseTo((10 * 5) / 34);
    });
});
