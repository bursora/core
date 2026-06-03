// Pin host TZ to a non-UTC zone to prove the resolved window reads the passed
// `tz`, not the host clock. Must run before any import that touches Date.
process.env.TZ = "America/Los_Angeles";

/**
 * Tests for resolveSpendWindow — parses optional `from`/`to` URL strings into
 * a `{from, to}` window with sane defaults and bounds.
 *
 * Behavior:
 *   - Both missing/empty/invalid → default to today as a full day in the given
 *     `tz`, expressed as UTC instants. With tz = "UTC" that's 00:00 →
 *     23:59:59.999 UTC; with a +02:00 zone the boundaries shift two hours
 *     earlier. Matches the "Today" preset in the date range picker.
 *   - Either missing → default that side.
 *   - Non-ISO strings rejected (fall back to default).
 *   - `from >= to` rejected (fall back to default).
 *   - Window clamped to MAX_SPAN_DAYS to bound DB load.
 */

import { resolveSpendWindow } from "@/app/(dashboard)/workspace/[workspaceId]/spend/_lib/resolve-window";
import { describe, expect, test } from "bun:test";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function utcMidnight(anchor: Date): Date {
    return new Date(
        Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate(), 0, 0, 0, 0),
    );
}

function utcEndOfDay(anchor: Date): Date {
    return new Date(
        Date.UTC(
            anchor.getUTCFullYear(),
            anchor.getUTCMonth(),
            anchor.getUTCDate(),
            23,
            59,
            59,
            999,
        ),
    );
}

describe("resolveSpendWindow", () => {
    test("missing from and to defaults to today (00:00 → 23:59:59.999 UTC)", () => {
        const now = new Date("2025-05-10T12:00:00Z");
        const w = resolveSpendWindow({ now, tz: "UTC" });
        expect(w.from.toISOString()).toBe("2025-05-10T00:00:00.000Z");
        expect(w.to.toISOString()).toBe("2025-05-10T23:59:59.999Z");
    });

    test("default window is UTC even when the host TZ is not (pinned to LA above)", () => {
        const now = new Date("2025-05-10T12:00:00Z");
        const w = resolveSpendWindow({ now, tz: "UTC" });
        expect(w.from.getTime()).toBe(utcMidnight(now).getTime());
        expect(w.to.getTime()).toBe(utcEndOfDay(now).getTime());
    });

    test("default window follows the given tz: +02:00 shifts boundaries earlier", () => {
        const now = new Date("2025-05-10T12:00:00Z");
        const w = resolveSpendWindow({ now, tz: "Europe/Tirane" });
        expect(w.from.toISOString()).toBe("2025-05-09T22:00:00.000Z");
        expect(w.to.toISOString()).toBe("2025-05-10T21:59:59.999Z");
    });

    test("parses valid ISO from and to", () => {
        const now = new Date("2025-05-10T12:00:00Z");
        const w = resolveSpendWindow({
            from: "2025-05-09T00:00:00Z",
            to: "2025-05-10T00:00:00Z",
            now,
            tz: "UTC",
        });
        expect(w.from.toISOString()).toBe("2025-05-09T00:00:00.000Z");
        expect(w.to.toISOString()).toBe("2025-05-10T00:00:00.000Z");
    });

    test("invalid ISO string falls back to default window", () => {
        const now = new Date("2025-05-10T12:00:00Z");
        const w = resolveSpendWindow({ from: "not-a-date", to: "also-not", now, tz: "UTC" });
        expect(w.from.getTime()).toBe(utcMidnight(now).getTime());
        expect(w.to.getTime()).toBe(utcEndOfDay(now).getTime());
    });

    test("rejects non-ISO-shaped strings that JS Date would otherwise accept", () => {
        const now = new Date("2025-05-10T12:00:00Z");
        // `new Date("1")` returns a valid Date in some JS engines; ensure we
        // reject anything that doesn't match the ISO 8601 shape.
        const w = resolveSpendWindow({ from: "1", to: "2025/05/10", now, tz: "UTC" });
        expect(w.from.getTime()).toBe(utcMidnight(now).getTime());
        expect(w.to.getTime()).toBe(utcEndOfDay(now).getTime());
    });

    test("from >= to is rejected and falls back to default", () => {
        const now = new Date("2025-05-10T12:00:00Z");
        const w = resolveSpendWindow({
            from: "2025-05-10T12:00:00Z",
            to: "2025-05-10T11:00:00Z",
            now,
            tz: "UTC",
        });
        expect(w.from.getTime()).toBe(utcMidnight(now).getTime());
        expect(w.to.getTime()).toBe(utcEndOfDay(now).getTime());
    });

    test("clamps span to at most 365 days", () => {
        const now = new Date("2026-05-10T12:00:00Z");
        const w = resolveSpendWindow({
            from: "2020-01-01T00:00:00Z",
            to: "2026-05-10T00:00:00Z",
            now,
            tz: "UTC",
        });
        const span = w.to.getTime() - w.from.getTime();
        expect(span).toBeLessThanOrEqual(365 * DAY_MS);
    });

    test("only `to` provided defaults `from` to start of `to`'s UTC day", () => {
        const now = new Date("2025-05-10T12:00:00Z");
        const to = new Date("2025-05-10T06:00:00Z");
        const w = resolveSpendWindow({ to: "2025-05-10T06:00:00Z", now, tz: "UTC" });
        expect(w.to.toISOString()).toBe("2025-05-10T06:00:00.000Z");
        expect(w.from.getTime()).toBe(utcMidnight(to).getTime());
    });

    test("only `from` provided defaults `to` to end of today (UTC)", () => {
        const now = new Date("2025-05-10T12:00:00Z");
        const w = resolveSpendWindow({ from: "2025-05-09T00:00:00Z", now, tz: "UTC" });
        expect(w.from.toISOString()).toBe("2025-05-09T00:00:00.000Z");
        expect(w.to.getTime()).toBe(utcEndOfDay(now).getTime());
    });
});
