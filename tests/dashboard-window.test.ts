/**
 * `dashboard-window` — builds a `[from, to)` slice plus the equal-length prior
 * slice for the dashboard's KPI deltas, from the same range the spend page's
 * date filter writes to the URL.
 *
 * Pure: no clock reads, no DB. Caller passes the parsed range.
 */

import { dashboardWindowFromRange, deltaWindows, windowLabel } from "@/lib/dashboard-window";
import { describe, expect, test } from "bun:test";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

describe("dashboardWindowFromRange", () => {
    test("keeps from/to and derives the prior slice of equal length ending at from", () => {
        const from = new Date("2026-05-10T15:30:42Z");
        const to = new Date("2026-05-17T15:30:42Z");
        const w = dashboardWindowFromRange(from, to);

        expect(w.from.toISOString()).toBe(from.toISOString());
        expect(w.to.toISOString()).toBe(to.toISOString());
        expect(w.priorTo.toISOString()).toBe(from.toISOString());
        expect(w.to.getTime() - w.from.getTime()).toBe(w.priorTo.getTime() - w.priorFrom.getTime());
        expect(w.priorFrom.toISOString()).toBe("2026-05-03T15:30:42.000Z");
    });

    test("labels a 7-day span as '7d'", () => {
        const to = new Date("2026-05-17T15:30:42Z");
        const w = dashboardWindowFromRange(new Date(to.getTime() - 7 * DAY_MS), to);
        expect(w.label).toBe("7d");
    });
});

describe("windowLabel", () => {
    test("matches rolling spans to their short label", () => {
        const to = new Date("2026-05-17T12:00:00Z");
        expect(windowLabel(new Date(to.getTime() - DAY_MS), to)).toBe("24h");
        expect(windowLabel(new Date(to.getTime() - 7 * DAY_MS), to)).toBe("7d");
        expect(windowLabel(new Date(to.getTime() - 14 * DAY_MS), to)).toBe("14d");
        expect(windowLabel(new Date(to.getTime() - 30 * DAY_MS), to)).toBe("30d");
    });

    test("tolerates a near-miss span (a to-date preset that ends at end-of-day)", () => {
        // "Today" / "Last 7 days" presets run to 23:59:59.999, a hair under the
        // exact rolling span; still reads as the rolling label.
        const to = new Date("2026-05-17T23:59:59.999Z");
        const from = new Date("2026-05-17T00:00:00.000Z");
        expect(windowLabel(from, to)).toBe("24h");
    });

    test("falls back to a compact date range for a custom span", () => {
        const from = new Date("2026-05-02T00:00:00Z");
        const to = new Date("2026-05-19T00:00:00Z");
        // Month/day formatting is locale-dependent; assert the separator shape.
        expect(windowLabel(from, to)).toContain("–");
    });
});

describe("deltaWindows", () => {
    test("in-progress window clamps current to now and truncates prior to the same elapsed", () => {
        const window = dashboardWindowFromRange(
            new Date("2026-05-17T00:00:00.000Z"),
            new Date("2026-05-17T23:59:59.999Z"),
        );
        const now = new Date("2026-05-17T06:00:00.000Z");
        const d = deltaWindows(window, now);

        // Current slice ends at `now`, not the future end-of-day.
        expect(d.from.toISOString()).toBe("2026-05-17T00:00:00.000Z");
        expect(d.to.toISOString()).toBe("2026-05-17T06:00:00.000Z");
        // Prior slice is anchored at the prior period's start and is the same length.
        expect(d.priorFrom.toISOString()).toBe(window.priorFrom.toISOString());
        expect(d.priorTo.getTime() - d.priorFrom.getTime()).toBe(6 * HOUR_MS);
        expect(d.to.getTime() - d.from.getTime()).toBe(d.priorTo.getTime() - d.priorFrom.getTime());
    });

    test("completed window (now >= to) keeps the full prior period", () => {
        const window = dashboardWindowFromRange(
            new Date("2026-05-10T00:00:00.000Z"),
            new Date("2026-05-17T00:00:00.000Z"),
        );
        const now = new Date("2026-05-20T00:00:00.000Z");
        const d = deltaWindows(window, now);

        expect(d.to.toISOString()).toBe(window.to.toISOString());
        expect(d.priorFrom.toISOString()).toBe(window.priorFrom.toISOString());
        expect(d.priorTo.toISOString()).toBe(window.priorTo.toISOString());
    });

    test("a window entirely in the future yields a zero-length comparison", () => {
        const window = dashboardWindowFromRange(
            new Date("2026-05-17T00:00:00.000Z"),
            new Date("2026-05-18T00:00:00.000Z"),
        );
        const now = new Date("2026-05-16T00:00:00.000Z");
        const d = deltaWindows(window, now);

        // Clamped to `from`: no elapsed time, both slices collapse to zero length.
        expect(d.to.getTime()).toBe(d.from.getTime());
        expect(d.priorTo.getTime()).toBe(d.priorFrom.getTime());
    });
});
