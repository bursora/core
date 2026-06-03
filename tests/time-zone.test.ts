// Pin host TZ to a non-UTC, non-target zone. The helpers take an explicit `tz`
// and pass it to Intl, so their output must not depend on the host clock — this
// pin proves it.
process.env.TZ = "Asia/Kolkata";

import {
    endOfDayInZone,
    formatInZone,
    isValidTimeZone,
    startOfDayInZone,
    startOfMonthInZone,
    startOfWeekInZone,
    zoneAbbrev,
} from "@/lib/time/zone";
import { describe, expect, test } from "bun:test";

// Wed 2026-06-03 11:41 UTC. Tirane is UTC+2 in June (summer).
const JUN3 = new Date("2026-06-03T11:41:00.000Z");

describe("startOfDayInZone / endOfDayInZone", () => {
    test("UTC is a pass-through to UTC day boundaries", () => {
        expect(startOfDayInZone(JUN3, "UTC").toISOString()).toBe("2026-06-03T00:00:00.000Z");
        expect(endOfDayInZone(JUN3, "UTC").toISOString()).toBe("2026-06-03T23:59:59.999Z");
    });

    test("a +02:00 zone shifts the boundary two hours earlier in UTC", () => {
        // Local Jun 3 00:00 in Tirane is Jun 2 22:00 UTC; local Jun 3 23:59:59.999
        // is Jun 3 21:59:59.999 UTC.
        expect(startOfDayInZone(JUN3, "Europe/Tirane").toISOString()).toBe(
            "2026-06-02T22:00:00.000Z",
        );
        expect(endOfDayInZone(JUN3, "Europe/Tirane").toISOString()).toBe(
            "2026-06-03T21:59:59.999Z",
        );
    });

    test("DST spring-forward: day start uses the pre-transition offset, end the post", () => {
        // America/New_York springs forward 2026-03-08 02:00 (EST -5 → EDT -4).
        const onTransitionDay = new Date("2026-03-08T12:00:00.000Z");
        expect(startOfDayInZone(onTransitionDay, "America/New_York").toISOString()).toBe(
            "2026-03-08T05:00:00.000Z",
        );
        expect(endOfDayInZone(onTransitionDay, "America/New_York").toISOString()).toBe(
            "2026-03-09T03:59:59.999Z",
        );
    });
});

describe("startOfMonthInZone", () => {
    test("first of the local month, expressed in UTC", () => {
        expect(startOfMonthInZone(JUN3, "Europe/Tirane").toISOString()).toBe(
            "2026-05-31T22:00:00.000Z",
        );
        expect(startOfMonthInZone(JUN3, "UTC").toISOString()).toBe("2026-06-01T00:00:00.000Z");
    });
});

describe("startOfWeekInZone", () => {
    test("Sunday-anchored week start, expressed in UTC", () => {
        // Wed Jun 3 2026 → Sunday May 31 2026. Local midnight in Tirane is the
        // prior day 22:00 UTC.
        expect(startOfWeekInZone(JUN3, "Europe/Tirane").toISOString()).toBe(
            "2026-05-30T22:00:00.000Z",
        );
        expect(startOfWeekInZone(JUN3, "UTC").toISOString()).toBe("2026-05-31T00:00:00.000Z");
    });
});

describe("formatInZone", () => {
    const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

    test("renders the same instant differently per zone", () => {
        expect(formatInZone(JUN3, "UTC", opts)).toBe("11:41 AM");
        expect(formatInZone(JUN3, "Europe/Tirane", opts)).toBe("1:41 PM");
    });
});

describe("zoneAbbrev", () => {
    test("returns a short zone label", () => {
        expect(zoneAbbrev(JUN3, "UTC")).toBe("UTC");
        expect(zoneAbbrev(JUN3, "Europe/Tirane").length).toBeGreaterThan(0);
    });
});

describe("isValidTimeZone", () => {
    test("accepts real IANA zones, rejects junk and empty", () => {
        expect(isValidTimeZone("Europe/Tirane")).toBe(true);
        expect(isValidTimeZone("UTC")).toBe(true);
        expect(isValidTimeZone("Not/AZone")).toBe(false);
        expect(isValidTimeZone("")).toBe(false);
    });
});
