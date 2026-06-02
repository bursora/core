// Pin host TZ to make day-of-week + boundary math deterministic. Must run
// before any other import that touches Date.
process.env.TZ = "America/Los_Angeles";

import {
    applyDayToDateTime,
    applyTimeToDate,
    computePresetWindow,
    formatRangeButtonLabel,
    formatTimeInput,
    PRESETS,
} from "@/components/ui/workspace/filters/date-range-picker-logic";
import { describe, expect, test } from "bun:test";

describe("computePresetWindow", () => {
    // Mon 2026-05-11 14:30 PT = 2026-05-11 21:30 UTC. Preset boundaries are UTC;
    // the LA pin at the top of this file proves they don't shift with host TZ.
    const now = new Date(2026, 4, 11, 14, 30, 0);

    test("today: from = 00:00, to = 23:59:59.999 UTC", () => {
        const { from, to } = computePresetWindow("today", now);
        expect(from.getUTCFullYear()).toBe(2026);
        expect(from.getUTCMonth()).toBe(4);
        expect(from.getUTCDate()).toBe(11);
        expect(from.getUTCHours()).toBe(0);
        expect(from.getUTCMinutes()).toBe(0);
        expect(to.getUTCDate()).toBe(11);
        expect(to.getUTCHours()).toBe(23);
        expect(to.getUTCMinutes()).toBe(59);
        expect(to.getUTCSeconds()).toBe(59);
        expect(to.getUTCMilliseconds()).toBe(999);
    });

    test("week-to-date: from = Sunday-of-this-week 00:00 UTC, to = end-of-today", () => {
        const { from, to } = computePresetWindow("week-to-date", now);
        // Sunday before Mon 2026-05-11 UTC is Sun 2026-05-10 00:00 UTC.
        expect(from.getUTCFullYear()).toBe(2026);
        expect(from.getUTCMonth()).toBe(4);
        expect(from.getUTCDate()).toBe(10);
        expect(from.getUTCHours()).toBe(0);
        expect(from.getUTCMinutes()).toBe(0);
        expect(to.getUTCDate()).toBe(11);
        expect(to.getUTCHours()).toBe(23);
        expect(to.getUTCMinutes()).toBe(59);
    });

    test("week-to-date: when `now` is Sunday, from = today 00:00 UTC", () => {
        // 2026-05-10 09:00 PT = 2026-05-10 16:00 UTC, a Sunday in UTC.
        const sunday = new Date(2026, 4, 10, 9, 0, 0);
        const { from } = computePresetWindow("week-to-date", sunday);
        expect(from.getUTCDate()).toBe(10);
        expect(from.getUTCHours()).toBe(0);
    });

    test("month-to-date: from = first of month 00:00 UTC, to = end-of-today", () => {
        const { from, to } = computePresetWindow("month-to-date", now);
        expect(from.getUTCFullYear()).toBe(2026);
        expect(from.getUTCMonth()).toBe(4);
        expect(from.getUTCDate()).toBe(1);
        expect(from.getUTCHours()).toBe(0);
        expect(to.getUTCDate()).toBe(11);
        expect(to.getUTCHours()).toBe(23);
    });

    test("last-7-days: from = 6 days ago 00:00 UTC, to = end-of-today", () => {
        const { from, to } = computePresetWindow("last-7-days", now);
        expect(from.getUTCDate()).toBe(5);
        expect(from.getUTCHours()).toBe(0);
        expect(to.getUTCDate()).toBe(11);
        expect(to.getUTCHours()).toBe(23);
    });

    test("last-14-days: from = 13 days ago 00:00 UTC", () => {
        const { from } = computePresetWindow("last-14-days", now);
        expect(from.getUTCMonth()).toBe(3);
        expect(from.getUTCDate()).toBe(28);
        expect(from.getUTCHours()).toBe(0);
    });

    test("last-30-days: from = 29 days ago 00:00 UTC", () => {
        const { from } = computePresetWindow("last-30-days", now);
        expect(from.getUTCMonth()).toBe(3);
        expect(from.getUTCDate()).toBe(12);
        expect(from.getUTCHours()).toBe(0);
    });

    test("PRESETS exposes the preset keys in order", () => {
        expect(PRESETS.map((p) => p.id)).toEqual([
            "today",
            "week-to-date",
            "month-to-date",
            "last-7-days",
            "last-14-days",
            "last-30-days",
        ]);
    });
});

describe("applyDayToDateTime", () => {
    test("replaces local Y/M/D, keeps local HH:MM:SS.mmm", () => {
        // react-day-picker emits a Date at local midnight when a day is
        // clicked. Construct one explicitly via local components.
        const original = new Date(2026, 4, 12, 14, 30, 45, 123);
        const newDay = new Date(2026, 0, 3, 0, 0, 0, 0);
        const result = applyDayToDateTime(original, newDay);
        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(0);
        expect(result.getDate()).toBe(3);
        expect(result.getHours()).toBe(14);
        expect(result.getMinutes()).toBe(30);
        expect(result.getSeconds()).toBe(45);
        expect(result.getMilliseconds()).toBe(123);
    });

    test("does not shift the day east of UTC at end-of-day local time", () => {
        // Original at 23:30 local. Picked day at local midnight. The result
        // must land on the picked local day, not the next/previous UTC day.
        const original = new Date(2026, 4, 12, 23, 30, 0, 0);
        const newDay = new Date(2026, 4, 12, 0, 0, 0, 0);
        const result = applyDayToDateTime(original, newDay);
        expect(result.getDate()).toBe(12);
        expect(result.getMonth()).toBe(4);
    });
});

describe("applyTimeToDate", () => {
    test("replaces local HH:MM, keeps local Y/M/D", () => {
        const original = new Date(2026, 4, 12, 14, 30, 45, 123);
        const result = applyTimeToDate(original, "08:15");
        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(4);
        expect(result.getDate()).toBe(12);
        expect(result.getHours()).toBe(8);
        expect(result.getMinutes()).toBe(15);
        expect(result.getSeconds()).toBe(0);
        expect(result.getMilliseconds()).toBe(0);
    });

    test("returns unchanged date when time string is malformed", () => {
        const original = new Date(2026, 4, 12, 14, 30, 0);
        expect(applyTimeToDate(original, "garbage").getTime()).toBe(original.getTime());
        expect(applyTimeToDate(original, "25:99").getTime()).toBe(original.getTime());
        expect(applyTimeToDate(original, "").getTime()).toBe(original.getTime());
    });
});

describe("formatTimeInput", () => {
    test("zero-pads HH:MM in local time", () => {
        const d = new Date(2026, 4, 12, 8, 5, 0);
        expect(formatTimeInput(d)).toBe("08:05");
    });

    test("handles 00:00", () => {
        const d = new Date(2026, 4, 12, 0, 0, 0);
        expect(formatTimeInput(d)).toBe("00:00");
    });
});

describe("formatRangeButtonLabel", () => {
    test("returns a non-empty 'from - to' string from Intl.DateTimeFormat", () => {
        const from = new Date(2026, 3, 27, 0, 0, 0);
        const to = new Date(2026, 4, 12, 23, 59, 0);
        const label = formatRangeButtonLabel(from, to);
        // Locale-sensitive output; only assert on shape.
        expect(label).toContain(" - ");
        expect(label.length).toBeGreaterThan(0);
    });
});
