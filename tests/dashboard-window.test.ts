/**
 * `dashboard-window` — URL-driven window math for the dashboard's NowStrip and
 * any KPI surface that opts into a window filter.
 *
 * Pure: no clock reads, no DB. Caller passes `now`. UTC-anchored so a single
 * day boundary is the same for everyone, regardless of viewer timezone.
 */

import { DEFAULT_WINDOW_KEY, parseWindowKey, resolveWindow } from "@/lib/dashboard-window";
import { describe, expect, test } from "bun:test";

describe("parseWindowKey", () => {
    test("returns DEFAULT_WINDOW_KEY ('today') for undefined", () => {
        expect(parseWindowKey(undefined)).toBe("today");
        expect(DEFAULT_WINDOW_KEY).toBe("today");
    });

    test("returns 'today' for empty string", () => {
        expect(parseWindowKey("")).toBe("today");
    });

    test("returns 'today' for an unknown string", () => {
        expect(parseWindowKey("forever")).toBe("today");
        expect(parseWindowKey("90d")).toBe("today");
    });

    test("returns 'today' for 'today'", () => {
        expect(parseWindowKey("today")).toBe("today");
    });

    test("returns 'week' for 'week'", () => {
        expect(parseWindowKey("week")).toBe("week");
    });

    test("returns 'month' for 'month'", () => {
        expect(parseWindowKey("month")).toBe("month");
    });

    test("returns 'today' when given an array (Next searchParams can pass arrays)", () => {
        // Arrays from duplicate query keys collapse to the default so the URL
        // can't sneak in an unexpected shape.
        expect(parseWindowKey(["today", "week"])).toBe("today");
    });
});

describe("resolveWindow", () => {
    test("today: from is 00:00 UTC of today, to is now, label is 'Today'", () => {
        const now = new Date("2026-05-17T15:30:42Z");
        const w = resolveWindow("today", now);
        expect(w.key).toBe("today");
        expect(w.from.toISOString()).toBe("2026-05-17T00:00:00.000Z");
        expect(w.to.toISOString()).toBe("2026-05-17T15:30:42.000Z");
        expect(w.label).toBe("Today");
    });

    test("today: prior is the previous UTC day", () => {
        const now = new Date("2026-05-17T15:30:42Z");
        const w = resolveWindow("today", now);
        expect(w.priorFrom.toISOString()).toBe("2026-05-16T00:00:00.000Z");
        expect(w.priorTo.toISOString()).toBe("2026-05-17T00:00:00.000Z");
    });

    test("week: from is 00:00 UTC of the most recent Monday", () => {
        // 2026-05-17 is a Sunday → Monday was 2026-05-11.
        const now = new Date("2026-05-17T09:00:00Z");
        const w = resolveWindow("week", now);
        expect(w.key).toBe("week");
        expect(w.from.toISOString()).toBe("2026-05-11T00:00:00.000Z");
        expect(w.to.toISOString()).toBe("2026-05-17T09:00:00.000Z");
        expect(w.label).toBe("Week");
    });

    test("week: when today is Monday, from is today 00:00 UTC", () => {
        // 2026-05-11 is a Monday.
        const now = new Date("2026-05-11T08:00:00Z");
        const w = resolveWindow("week", now);
        expect(w.from.toISOString()).toBe("2026-05-11T00:00:00.000Z");
    });

    test("week: prior window is the 7 days before from", () => {
        const now = new Date("2026-05-17T09:00:00Z");
        const w = resolveWindow("week", now);
        expect(w.priorFrom.toISOString()).toBe("2026-05-04T00:00:00.000Z");
        expect(w.priorTo.toISOString()).toBe("2026-05-11T00:00:00.000Z");
    });

    test("month: from is 00:00 UTC of day 1, to is now, label is 'Month'", () => {
        const now = new Date("2026-05-17T15:30:00Z");
        const w = resolveWindow("month", now);
        expect(w.key).toBe("month");
        expect(w.from.toISOString()).toBe("2026-05-01T00:00:00.000Z");
        expect(w.to.toISOString()).toBe("2026-05-17T15:30:00.000Z");
        expect(w.label).toBe("Month");
    });

    test("month: prior window has the same length as [from, to] and ends at from", () => {
        const now = new Date("2026-05-17T15:30:00Z");
        const w = resolveWindow("month", now);
        const length = w.to.getTime() - w.from.getTime();
        expect(w.priorTo.toISOString()).toBe(w.from.toISOString());
        expect(w.priorFrom.getTime()).toBe(w.from.getTime() - length);
        // sanity: NOT the previous calendar month.
        expect(w.priorFrom.toISOString()).not.toBe("2026-04-01T00:00:00.000Z");
    });

    test("month boundary: month with leap-year February rolls correctly", () => {
        // 2024-02-29 exists. Window starts at Feb 1; to is right now.
        const now = new Date("2024-02-29T12:00:00Z");
        const w = resolveWindow("month", now);
        expect(w.from.toISOString()).toBe("2024-02-01T00:00:00.000Z");
        expect(w.to.toISOString()).toBe("2024-02-29T12:00:00.000Z");
    });

    test("today on leap day: from is 2024-02-29 00:00 UTC", () => {
        const now = new Date("2024-02-29T05:00:00Z");
        const w = resolveWindow("today", now);
        expect(w.from.toISOString()).toBe("2024-02-29T00:00:00.000Z");
        expect(w.priorFrom.toISOString()).toBe("2024-02-28T00:00:00.000Z");
        expect(w.priorTo.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    });
});
