/**
 * Tests for the pure axis geometry helper used by the Runway timeline.
 *
 * `computeAxisGeometry` takes a start date, end date, and tick inputs (each
 * with a label and an absolute date) and returns positions as `[0, 1]` ratios
 * along the axis. Out-of-range ticks clamp to 0 or 1 with `outOfRange: true`.
 * Labels that fall within ~10% of axis width of each other alternate stack
 * depths so they don't overlap.
 *
 * Pure: no clock, no DOM, no IO. The caller passes everything in.
 */

import { computeAxisGeometry, type TickInput } from "@/lib/viz/runway-axis";
import { describe, expect, test } from "bun:test";

const START = new Date("2025-05-10T00:00:00.000Z");
const END = new Date("2025-05-20T00:00:00.000Z"); // 10-day axis

const tick = (over: Partial<TickInput> & { date: Date; label: string }): TickInput => ({
    id: over.id ?? "t",
    label: over.label,
    date: over.date,
    tone: over.tone ?? "muted",
});

describe("computeAxisGeometry", () => {
    test("returns empty positions when no ticks are provided", () => {
        const geom = computeAxisGeometry({ start: START, end: END, ticks: [] });

        expect(geom.ticks).toHaveLength(0);
    });

    test("places a single tick at axis midpoint at position 0.5", () => {
        // Midpoint of 2025-05-10 → 2025-05-20 is 2025-05-15.
        const mid = new Date("2025-05-15T00:00:00.000Z");

        const geom = computeAxisGeometry({
            start: START,
            end: END,
            ticks: [tick({ id: "mid", label: "mid", date: mid })],
        });

        expect(geom.ticks).toHaveLength(1);
        expect(geom.ticks[0]?.position).toBeCloseTo(0.5, 5);
        expect(geom.ticks[0]?.outOfRange).toBe(false);
    });

    test("clamps a tick before start to position 0 and marks it out-of-range", () => {
        const before = new Date("2025-05-01T00:00:00.000Z");

        const geom = computeAxisGeometry({
            start: START,
            end: END,
            ticks: [tick({ id: "before", label: "before", date: before })],
        });

        expect(geom.ticks[0]?.position).toBe(0);
        expect(geom.ticks[0]?.outOfRange).toBe(true);
    });

    test("clamps a tick after end to position 1 and marks it out-of-range", () => {
        const after = new Date("2025-06-01T00:00:00.000Z");

        const geom = computeAxisGeometry({
            start: START,
            end: END,
            ticks: [tick({ id: "after", label: "after", date: after })],
        });

        expect(geom.ticks[0]?.position).toBe(1);
        expect(geom.ticks[0]?.outOfRange).toBe(true);
    });

    test("alternates stack depths when two ticks fall within ~10% of axis width", () => {
        // 10-day axis: 10% = 1 day. Ticks at day 5 and day 5.5 → 0.05 apart in ratio space.
        const a = new Date("2025-05-15T00:00:00.000Z");
        const b = new Date("2025-05-15T12:00:00.000Z");

        const geom = computeAxisGeometry({
            start: START,
            end: END,
            ticks: [
                tick({ id: "a", label: "acme cap · in 5 days", date: a }),
                tick({ id: "b", label: "globex cap · in 5 days", date: b }),
            ],
        });

        expect(geom.ticks).toHaveLength(2);
        // Ticks are sorted by position; depths should alternate (0, 1).
        expect(geom.ticks[0]?.stackDepth).toBe(0);
        expect(geom.ticks[1]?.stackDepth).toBe(1);
    });

    test("increments stack depth per cluster when three ticks fall within ~10% of each other", () => {
        // Three ticks within the close threshold — depths must NOT collide.
        // Old (0, 1, 0) implementation overlapped the third with the first.
        const a = new Date("2025-05-15T00:00:00.000Z");
        const b = new Date("2025-05-15T08:00:00.000Z");
        const c = new Date("2025-05-15T16:00:00.000Z");

        const geom = computeAxisGeometry({
            start: START,
            end: END,
            ticks: [
                tick({ id: "a", label: "a", date: a }),
                tick({ id: "b", label: "b", date: b }),
                tick({ id: "c", label: "c", date: c }),
            ],
        });

        expect(geom.ticks).toHaveLength(3);
        const depths = geom.ticks.map((t) => t.stackDepth);
        expect(new Set(depths).size).toBe(3);
        expect(depths[0]).toBe(0);
        expect(depths[1]).toBe(1);
        expect(depths[2]).toBe(2);
    });

    test("resets stack depth back to 0 after a gap clears the close threshold", () => {
        // Two close ticks at day ~5, then a tick on day ~9 (well past 10% gap).
        const a = new Date("2025-05-15T00:00:00.000Z");
        const b = new Date("2025-05-15T12:00:00.000Z");
        const c = new Date("2025-05-19T00:00:00.000Z");

        const geom = computeAxisGeometry({
            start: START,
            end: END,
            ticks: [
                tick({ id: "a", label: "a", date: a }),
                tick({ id: "b", label: "b", date: b }),
                tick({ id: "c", label: "c", date: c }),
            ],
        });

        expect(geom.ticks[0]?.stackDepth).toBe(0);
        expect(geom.ticks[1]?.stackDepth).toBe(1);
        expect(geom.ticks[2]?.stackDepth).toBe(0);
    });

    test("uses stack depth 0 for all ticks when spread across the axis", () => {
        // 5 ticks evenly spaced across a 10-day axis (every 2 days) → ~20% apart.
        const dates = [
            new Date("2025-05-11T00:00:00.000Z"),
            new Date("2025-05-13T00:00:00.000Z"),
            new Date("2025-05-15T00:00:00.000Z"),
            new Date("2025-05-17T00:00:00.000Z"),
            new Date("2025-05-19T00:00:00.000Z"),
        ];

        const geom = computeAxisGeometry({
            start: START,
            end: END,
            ticks: dates.map((d, i) => tick({ id: `t${i}`, label: `t${i}`, date: d })),
        });

        expect(geom.ticks).toHaveLength(5);
        for (const t of geom.ticks) {
            expect(t.stackDepth).toBe(0);
        }
    });
});
