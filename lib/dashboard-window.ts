// Dashboard window: a `[from, to)` slice plus the equal-length prior slice for
// KPI deltas. Built from the same `from`/`to` URL range the spend page uses, so
// both surfaces share one filter model. Pure - caller passes the parsed range.
//
// `priorFrom`/`priorTo` are the slice of equal length immediately before
// `from`, so pace/burn tiles compare like-for-like against the prior period.

import { formatInZone } from "@/lib/time/zone";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface DashboardWindow {
    readonly from: Date;
    readonly to: Date;
    readonly priorFrom: Date;
    readonly priorTo: Date;
    readonly label: string;
}

// Spans the date filter's quick pills offer. A window whose length matches one
// (within tolerance) gets the short label instead of a raw date range, so tiles
// read "Spend, 7d" rather than "Spend, May 10 – May 17".
const ROLLING_LABELS: readonly { readonly spanMs: number; readonly label: string }[] = [
    { spanMs: DAY_MS, label: "24h" },
    { spanMs: 7 * DAY_MS, label: "7d" },
    { spanMs: 14 * DAY_MS, label: "14d" },
    { spanMs: 30 * DAY_MS, label: "30d" },
];

const LABEL_TOLERANCE_MS = 2 * MINUTE_MS;

const RANGE_OPTS: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

export function windowLabel(from: Date, to: Date, tz: string = "UTC"): string {
    const span = to.getTime() - from.getTime();
    for (const r of ROLLING_LABELS) {
        if (Math.abs(span - r.spanMs) <= LABEL_TOLERANCE_MS) return r.label;
    }
    return `${formatInZone(from, tz, RANGE_OPTS)} – ${formatInZone(to, tz, RANGE_OPTS)}`;
}

export function dashboardWindowFromRange(
    from: Date,
    to: Date,
    tz: string = "UTC",
): DashboardWindow {
    const span = to.getTime() - from.getTime();
    return {
        from,
        to,
        priorFrom: new Date(from.getTime() - span),
        priorTo: from,
        label: windowLabel(from, to, tz),
    };
}

/** A `[from, to)` current slice and its like-for-like prior comparison slice. */
export interface DeltaWindow {
    readonly from: Date;
    readonly to: Date;
    readonly priorFrom: Date;
    readonly priorTo: Date;
}

/**
 * Windows for an honest "vs prior" delta on a possibly in-progress period.
 *
 * The selected window's `to` runs to the end of the period (the future for
 * today / this-week / this-month), so comparing the full current window against
 * the full prior period pits a partial period against a complete one; e.g.
 * today-so-far vs all-of-yesterday reads as a steep drop while spend is flat.
 *
 * This clamps the current side to `now` and truncates the prior period to the
 * same elapsed length measured from its start (`window.priorFrom`), so the two
 * sides cover an equal span anchored the same way: today-so-far vs
 * yesterday-by-this-time. A window already fully in the past (`now >= to`)
 * collapses to the full prior period, unchanged.
 */
export function deltaWindows(window: DashboardWindow, now: Date): DeltaWindow {
    // Clamp `now` into [from, to] so the current slice never inverts (future
    // window) or overruns the selected period.
    const curToMs = Math.min(window.to.getTime(), Math.max(window.from.getTime(), now.getTime()));
    const elapsed = curToMs - window.from.getTime();
    return {
        from: window.from,
        to: new Date(curToMs),
        priorFrom: window.priorFrom,
        priorTo: new Date(window.priorFrom.getTime() + elapsed),
    };
}
