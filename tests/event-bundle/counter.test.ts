/**
 * Pure-math tests for the event-bundle accounting:
 *   - banner threshold ladder
 *   - overage cents computation
 *   - hard-cap projection
 *   - monthKey formatting
 */

import {
    BUNDLE_EVENTS_PER_MONTH,
    OVERAGE_CENTS_PER_1000,
    bannerLevel,
    monthKey,
    overageCentsAt,
    wouldExceedHardCap,
} from "@/lib/event-bundle/counter";
import { describe, expect, test } from "bun:test";

describe("bannerLevel", () => {
    test("none below 80% bundle", () => {
        expect(bannerLevel({ eventsCount: 0, hardCapHit: false })).toBe("none");
        expect(
            bannerLevel({
                eventsCount: BUNDLE_EVENTS_PER_MONTH * 0.5,
                hardCapHit: false,
            }),
        ).toBe("none");
    });

    test("approaching at 80%+", () => {
        expect(
            bannerLevel({
                eventsCount: BUNDLE_EVENTS_PER_MONTH * 0.8,
                hardCapHit: false,
            }),
        ).toBe("approaching");
        expect(
            bannerLevel({
                eventsCount: BUNDLE_EVENTS_PER_MONTH - 1,
                hardCapHit: false,
            }),
        ).toBe("approaching");
    });

    test("exhausted at 100%+", () => {
        expect(bannerLevel({ eventsCount: BUNDLE_EVENTS_PER_MONTH, hardCapHit: false })).toBe(
            "exhausted",
        );
        expect(
            bannerLevel({
                eventsCount: BUNDLE_EVENTS_PER_MONTH * 1.4,
                hardCapHit: false,
            }),
        ).toBe("exhausted");
    });

    test("heavy at 150%+", () => {
        expect(
            bannerLevel({
                eventsCount: BUNDLE_EVENTS_PER_MONTH * 1.5,
                hardCapHit: false,
            }),
        ).toBe("heavy");
    });

    test("hard cap hit forces heavy regardless of count", () => {
        expect(bannerLevel({ eventsCount: 0, hardCapHit: true })).toBe("heavy");
    });
});

describe("overageCentsAt", () => {
    test("zero at or below bundle", () => {
        expect(overageCentsAt(0)).toBe(0);
        expect(overageCentsAt(BUNDLE_EVENTS_PER_MONTH)).toBe(0);
    });

    test("30 cents per 1000 events past the bundle", () => {
        expect(overageCentsAt(BUNDLE_EVENTS_PER_MONTH + 1_000)).toBe(OVERAGE_CENTS_PER_1000);
        expect(overageCentsAt(BUNDLE_EVENTS_PER_MONTH + 10_000)).toBe(10 * OVERAGE_CENTS_PER_1000);
    });

    test("partial 1000 ceils up", () => {
        expect(overageCentsAt(BUNDLE_EVENTS_PER_MONTH + 1)).toBe(1);
        expect(overageCentsAt(BUNDLE_EVENTS_PER_MONTH + 500)).toBe(15);
    });
});

describe("wouldExceedHardCap", () => {
    test("returns false when no cap configured", () => {
        const result = wouldExceedHardCap({
            priorCount: BUNDLE_EVENTS_PER_MONTH,
            nextEventCount: 100_000,
            hardCapUsdCents: null,
        });
        expect(result).toBe(false);
    });

    test("returns false when projected overage stays under cap", () => {
        // $5 cap = 500 cents. 1000 events of overage = 30 cents. Well under.
        const result = wouldExceedHardCap({
            priorCount: BUNDLE_EVENTS_PER_MONTH,
            nextEventCount: 1000,
            hardCapUsdCents: 500,
        });
        expect(result).toBe(false);
    });

    test("returns true when projected overage exceeds cap", () => {
        // $1 cap = 100 cents. 5000 events of overage = 150 cents. Trips.
        const result = wouldExceedHardCap({
            priorCount: BUNDLE_EVENTS_PER_MONTH,
            nextEventCount: 5_000,
            hardCapUsdCents: 100,
        });
        expect(result).toBe(true);
    });

    test("considers prior accrued overage", () => {
        // $1 cap. Already at +5000 overage events (150 cents > cap is already
        // exceeded). One more event still trips.
        const result = wouldExceedHardCap({
            priorCount: BUNDLE_EVENTS_PER_MONTH + 5_000,
            nextEventCount: 1,
            hardCapUsdCents: 100,
        });
        expect(result).toBe(true);
    });
});

describe("monthKey", () => {
    test("formats UTC date as YYYY-MM", () => {
        expect(monthKey(new Date("2025-01-15T12:00:00Z"))).toBe("2025-01");
        expect(monthKey(new Date("2025-12-31T23:59:59Z"))).toBe("2025-12");
    });

    test("pads single-digit months", () => {
        expect(monthKey(new Date("2025-03-01T00:00:00Z"))).toBe("2025-03");
    });
});
