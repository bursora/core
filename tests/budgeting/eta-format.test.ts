/**
 * formatEtaHint covers the urgency phrases shared by the What-breaks-first
 * stack and the Runway timeline. Singular vs plural is resolved on the
 * rounded value, and anything under one day is rounded up to hours with a
 * minimum of one (so "in 0 hours" is impossible).
 */

import { ETA_SOON_DAYS, ETA_URGENT_DAYS, formatEtaHint } from "@/lib/budgeting/eta-format";
import { describe, expect, test } from "bun:test";

describe("formatEtaHint", () => {
    test("renders 'in 1 hour' (singular) at one hour", () => {
        expect(formatEtaHint(1 / 24)).toBe("in 1 hour");
    });

    test("renders 'in 3 hours' (plural) at three hours", () => {
        expect(formatEtaHint(3 / 24)).toBe("in 3 hours");
    });

    test("rounds tiny fractions up to at least one hour", () => {
        expect(formatEtaHint(0.001)).toBe("in 1 hour");
    });

    test("renders 'in 1 day' (singular) at one day", () => {
        expect(formatEtaHint(1)).toBe("in 1 day");
    });

    test("renders 'in 5 days' (plural) at five days", () => {
        expect(formatEtaHint(5)).toBe("in 5 days");
    });

    test("rounds to whole days for any value at or above one day", () => {
        expect(formatEtaHint(4.4)).toBe("in 4 days");
        expect(formatEtaHint(4.6)).toBe("in 5 days");
    });

    test("exposes ETA threshold constants", () => {
        expect(ETA_URGENT_DAYS).toBe(1);
        expect(ETA_SOON_DAYS).toBe(7);
    });
});
