/**
 * Tests for the pricing-override input validators.
 *
 * assertNonNegativeRate: parses a decimal string, rejecting non-numeric and
 * negative values; zero and positive decimals pass.
 * assertEffectiveWindow: effectiveTo must be null or strictly after
 * effectiveFrom; equal or earlier throws.
 */

import {
    assertEffectiveWindow,
    assertNonNegativeRate,
} from "@/lib/metering/pricing/validate-pricing-input";
import { describe, expect, test } from "bun:test";

describe("assertNonNegativeRate", () => {
    test("throws with field and value when the input is not numeric", () => {
        expect(() => assertNonNegativeRate("inputPer1mUsd", "abc")).toThrow(
            "inputPer1mUsd is not a valid decimal: abc",
        );
    });

    test("throws with field and value when the input is negative", () => {
        expect(() => assertNonNegativeRate("outputPer1mUsd", "-0.5")).toThrow(
            "outputPer1mUsd must be non-negative: -0.5",
        );
    });

    test("passes for zero", () => {
        expect(() => assertNonNegativeRate("cachePer1mUsd", "0")).not.toThrow();
    });

    test("passes for a positive decimal", () => {
        expect(() => assertNonNegativeRate("inputPer1mUsd", "0.0025")).not.toThrow();
    });
});

describe("assertEffectiveWindow", () => {
    test("passes when effectiveTo is null", () => {
        expect(() => assertEffectiveWindow(new Date("2024-01-01T00:00:00Z"), null)).not.toThrow();
    });

    test("passes when effectiveTo is strictly after effectiveFrom", () => {
        expect(() =>
            assertEffectiveWindow(
                new Date("2024-01-01T00:00:00Z"),
                new Date("2024-06-01T00:00:00Z"),
            ),
        ).not.toThrow();
    });

    test("throws when effectiveTo equals effectiveFrom", () => {
        const at = new Date("2024-01-01T00:00:00Z");
        expect(() => assertEffectiveWindow(at, new Date(at.getTime()))).toThrow(
            "effectiveTo must be strictly after effectiveFrom",
        );
    });

    test("throws when effectiveTo is before effectiveFrom", () => {
        expect(() =>
            assertEffectiveWindow(
                new Date("2024-06-01T00:00:00Z"),
                new Date("2024-01-01T00:00:00Z"),
            ),
        ).toThrow("effectiveTo must be strictly after effectiveFrom");
    });
});
