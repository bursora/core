/**
 * Period helpers — pure UTC window math for budget evaluation.
 *
 * A budget's `period` column is a string literal: "daily" | "weekly" | "monthly".
 * `periodWindow(period, now)` returns the half-open `[from, to)` UTC window
 * that contains `now` for the given period.
 *
 *   daily   → [start of UTC day, start of next UTC day)
 *   weekly  → [start of ISO week (Mon), start of next ISO week)
 *   monthly → [start of UTC month, start of next UTC month)
 *
 * The aggregator queries `usage_events` with `ts >= from AND ts < to` so we
 * never double-count an event that lands exactly on a boundary.
 *
 * Pure: no clock reads, no DB. The caller passes `now`. Domain stays free of
 * `Date.now()` so tests can pin time without a mock.
 */

export const PERIODS = ["daily", "weekly", "monthly"] as const;
export type Period = (typeof PERIODS)[number];

export interface PeriodWindow {
    readonly from: Date;
    readonly to: Date;
}

export function periodWindow(period: Period, now: Date): PeriodWindow {
    if (period === "daily") return dailyWindow(now);
    if (period === "weekly") return weeklyWindow(now);
    if (period === "monthly") return monthlyWindow(now);
    throw new Error(`unknown period: ${String(period)}`);
}

function dailyWindow(now: Date): PeriodWindow {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    return { from, to };
}

function weeklyWindow(now: Date): PeriodWindow {
    // ISO week: Monday = 1, Sunday = 7. `getUTCDay()` returns 0 for Sunday.
    const dayOfWeek = now.getUTCDay();
    const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const from = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday),
    );
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    return { from, to };
}

function monthlyWindow(now: Date): PeriodWindow {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { from, to };
}

/** Start of the UTC day containing `d` (00:00:00.000 UTC). */
export function startOfDayUtc(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Start of the UTC month containing `d` (1st, 00:00:00.000 UTC). */
export function startOfMonthUtc(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * Injection seam for period math. Lets use cases pin a deterministic window
 * in tests without faking `Date.now()`. Production wires `defaultPeriodResolver`.
 */
export interface PeriodResolver {
    resolveWindow(period: Period, now: Date): PeriodWindow;
}

export const defaultPeriodResolver: PeriodResolver = {
    resolveWindow: (period, now) => periodWindow(period, now),
};
