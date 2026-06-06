/**
 * `parseBillingInterval` is the boundary guard for the interval a checkout asks
 * for. It must accept only the two Lemon Squeezy interval values and reject
 * anything else, so a forged form field can never open checkout against an
 * arbitrary variant.
 */

import { parseBillingInterval } from "@/lib/plans/plan";
import { describe, expect, test } from "bun:test";

describe("parseBillingInterval", () => {
    test("accepts the two valid intervals", () => {
        expect(parseBillingInterval("month")).toBe("month");
        expect(parseBillingInterval("year")).toBe("year");
    });

    test("rejects anything else", () => {
        for (const bad of ["", "monthly", "annual", "MONTH", "week", null, undefined, 1, {}]) {
            expect(parseBillingInterval(bad)).toBeNull();
        }
    });
});
