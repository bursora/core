import { computeSharePercent } from "@/lib/spend-share";
import { describe, expect, test } from "bun:test";

describe("computeSharePercent", () => {
    test("returns 0 when total is zero", () => {
        expect(computeSharePercent("0", "0")).toBe(0);
    });

    test("returns 100 when value equals total", () => {
        expect(computeSharePercent("12.50", "12.50")).toBe(100);
    });

    test("returns proportional percentage", () => {
        expect(computeSharePercent("2.5", "10")).toBe(25);
    });

    test("clamps over-total values to 100", () => {
        expect(computeSharePercent("50", "10")).toBe(100);
    });

    test("clamps negatives to 0", () => {
        expect(computeSharePercent("-5", "10")).toBe(0);
    });

    test("treats invalid numeric strings as 0", () => {
        expect(computeSharePercent("abc", "10")).toBe(0);
    });
});
