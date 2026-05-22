/**
 * Tests for the period window calculator.
 *
 * `periodWindow(period, now)` returns the [from, to) UTC window that contains
 * `now` for the given period. `from` is the start of the window (inclusive)
 * and `to` is the start of the next window (exclusive). All boundaries are
 * UTC.
 *
 * Documented policy:
 *   - `daily` → start of UTC day to start of next UTC day.
 *   - `weekly` → start of ISO week (Monday) UTC to start of next ISO week.
 *   - `monthly` → start of UTC month to start of next UTC month.
 *   - Unknown period strings throw — periods are validated at the boundary.
 */

import { periodWindow } from "@/lib/budgeting";
import { describe, expect, test } from "bun:test";

describe("periodWindow", () => {
    test("daily: midday returns start-of-day to start-of-next-day", () => {
        const now = new Date("2025-05-10T12:34:56.789Z");
        const w = periodWindow("daily", now);
        expect(w.from.toISOString()).toBe("2025-05-10T00:00:00.000Z");
        expect(w.to.toISOString()).toBe("2025-05-11T00:00:00.000Z");
    });

    test("daily: exact midnight returns same-day to next-day", () => {
        const now = new Date("2025-05-10T00:00:00.000Z");
        const w = periodWindow("daily", now);
        expect(w.from.toISOString()).toBe("2025-05-10T00:00:00.000Z");
        expect(w.to.toISOString()).toBe("2025-05-11T00:00:00.000Z");
    });

    test("daily: rolls over month boundary", () => {
        const now = new Date("2025-04-30T23:59:59.999Z");
        const w = periodWindow("daily", now);
        expect(w.from.toISOString()).toBe("2025-04-30T00:00:00.000Z");
        expect(w.to.toISOString()).toBe("2025-05-01T00:00:00.000Z");
    });

    test("weekly: a Wednesday resolves to Monday-to-next-Monday UTC", () => {
        // 2025-05-07 (Wed) → ISO week starts Mon 2025-05-05.
        const now = new Date("2025-05-07T15:00:00.000Z");
        const w = periodWindow("weekly", now);
        expect(w.from.toISOString()).toBe("2025-05-05T00:00:00.000Z");
        expect(w.to.toISOString()).toBe("2025-05-12T00:00:00.000Z");
    });

    test("weekly: a Sunday belongs to the prior Monday's week", () => {
        // 2025-05-11 (Sun) is the LAST day of the ISO week starting Mon 2025-05-05.
        const now = new Date("2025-05-11T23:00:00.000Z");
        const w = periodWindow("weekly", now);
        expect(w.from.toISOString()).toBe("2025-05-05T00:00:00.000Z");
        expect(w.to.toISOString()).toBe("2025-05-12T00:00:00.000Z");
    });

    test("weekly: a Monday is the start of its own week", () => {
        const now = new Date("2025-05-05T00:00:00.000Z");
        const w = periodWindow("weekly", now);
        expect(w.from.toISOString()).toBe("2025-05-05T00:00:00.000Z");
        expect(w.to.toISOString()).toBe("2025-05-12T00:00:00.000Z");
    });

    test("monthly: mid-month resolves to first-of-month to first-of-next-month", () => {
        const now = new Date("2025-05-15T08:00:00.000Z");
        const w = periodWindow("monthly", now);
        expect(w.from.toISOString()).toBe("2025-05-01T00:00:00.000Z");
        expect(w.to.toISOString()).toBe("2025-06-01T00:00:00.000Z");
    });

    test("monthly: December rolls into January of next year", () => {
        const now = new Date("2024-12-20T00:00:00.000Z");
        const w = periodWindow("monthly", now);
        expect(w.from.toISOString()).toBe("2024-12-01T00:00:00.000Z");
        expect(w.to.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    });

    test("unknown period string throws", () => {
        // @ts-expect-error — unknown period string
        expect(() => periodWindow("yearly", new Date())).toThrow();
    });
});
