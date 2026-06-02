// Dashboard window: a `[from, to)` slice plus the equal-length prior slice for
// KPI deltas. Built from the same `from`/`to` URL range the spend page uses, so
// both surfaces share one filter model. Pure - caller passes the parsed range.
//
// `priorFrom`/`priorTo` are the slice of equal length immediately before
// `from`, so pace/burn tiles compare like-for-like against the prior period.

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

const RANGE_FMT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function windowLabel(from: Date, to: Date): string {
    const span = to.getTime() - from.getTime();
    for (const r of ROLLING_LABELS) {
        if (Math.abs(span - r.spanMs) <= LABEL_TOLERANCE_MS) return r.label;
    }
    return `${RANGE_FMT.format(from)} – ${RANGE_FMT.format(to)}`;
}

export function dashboardWindowFromRange(from: Date, to: Date): DashboardWindow {
    const span = to.getTime() - from.getTime();
    return {
        from,
        to,
        priorFrom: new Date(from.getTime() - span),
        priorTo: from,
        label: windowLabel(from, to),
    };
}
