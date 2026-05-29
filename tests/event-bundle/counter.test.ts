/**
 * Pure-math tests for the event-bundle accounting:
 *   - fair-use banner threshold ladder (none / approaching / exhausted)
 *   - monthKey formatting
 *
 * The 5M events/month bundle is a fixed fair-use cap. There is no overage
 * billing and no per-workspace dollar cap, so the ladder tops out at
 * "exhausted" — ingest is never blocked, the dashboard only warns.
 */

import { BUNDLE_EVENTS_PER_MONTH, bannerLevel, monthKey } from "@/lib/event-bundle/counter";
import { describe, expect, test } from "bun:test";

describe("BUNDLE_EVENTS_PER_MONTH", () => {
    test("is the fixed 5M fair-use threshold", () => {
        expect(BUNDLE_EVENTS_PER_MONTH).toBe(5_000_000);
    });
});

describe("bannerLevel", () => {
    test("none below 80% of the bundle", () => {
        expect(bannerLevel(0)).toBe("none");
        expect(bannerLevel(BUNDLE_EVENTS_PER_MONTH * 0.5)).toBe("none");
    });

    test("approaching from 80% up to the bundle", () => {
        expect(bannerLevel(BUNDLE_EVENTS_PER_MONTH * 0.8)).toBe("approaching");
        expect(bannerLevel(BUNDLE_EVENTS_PER_MONTH - 1)).toBe("approaching");
    });

    test("exhausted at the bundle and beyond", () => {
        expect(bannerLevel(BUNDLE_EVENTS_PER_MONTH)).toBe("exhausted");
        expect(bannerLevel(BUNDLE_EVENTS_PER_MONTH * 3)).toBe("exhausted");
    });
});

describe("monthKey", () => {
    test("formats UTC date as YYYY-MM", () => {
        expect<string>(monthKey(new Date("2025-01-15T12:00:00Z"))).toBe("2025-01");
        expect<string>(monthKey(new Date("2025-12-31T23:59:59Z"))).toBe("2025-12");
    });

    test("pads single-digit months", () => {
        expect<string>(monthKey(new Date("2025-03-01T00:00:00Z"))).toBe("2025-03");
    });
});
