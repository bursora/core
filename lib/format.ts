/**
 * Number-formatting helpers shared across the dashboard.
 *
 * Wraps Intl.NumberFormat to produce consistent USD amounts, compact token
 * counts, and percent deviations. All helpers accept a locale override so
 * server-rendered pages can match the request's Accept-Language and clients
 * can fall back to the user's runtime locale.
 *
 * Drizzle numeric columns return strings, so `formatUsd` accepts both
 * `number` and `string`. Non-finite or unparseable input falls back to a
 * neutral zero-shaped string rather than rendering "NaN" in the UI.
 */

const USD_MIN_FRACTION = 2;
const USD_MAX_FRACTION = 2;
const PRECISE_USD_MAX_FRACTION = 6;
const PERCENT_FRACTION = 1;

function toFinite(n: number | string): number {
    const value = typeof n === "string" ? Number(n) : n;
    return Number.isFinite(value) ? value : 0;
}

export function formatUsd(n: number | string, locale?: string): string {
    const value = toFinite(n);
    const max = value > 0 && value < 0.01 ? PRECISE_USD_MAX_FRACTION : USD_MAX_FRACTION;
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: USD_MIN_FRACTION,
        maximumFractionDigits: max,
    }).format(value);
}

/**
 * USD formatter that keeps sub-cent precision (up to 6 fractional digits).
 * Used for per-call cost cells where values can be fractions of a cent.
 * Standard tiles, headlines, and totals should use `formatUsd` instead.
 */
export function formatPreciseUsd(n: number | string, locale?: string): string {
    const value = toFinite(n);
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: USD_MIN_FRACTION,
        maximumFractionDigits: PRECISE_USD_MAX_FRACTION,
    }).format(value);
}

export function normalizeNumericInput(value: string): string {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? String(n) : value;
}

export function formatCount(n: number, locale?: string): string {
    const value = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat(locale).format(value);
}

/**
 * Per-call cost from an aggregate spend total. Returns null when there are no
 * calls so callers can render their own fallback (e.g. an em dash or
 * "No calls in range") rather than a misleading "$0.00" or "$NaN".
 */
export function formatAvgCostPerCall(
    totalUsd: string,
    totalCalls: number,
    locale?: string,
): string | null {
    if (totalCalls <= 0) return null;
    return formatPreciseUsd(toFinite(totalUsd) / totalCalls, locale);
}

/**
 * Per-call cost for a single facet row. Same null-on-zero contract as
 * `formatAvgCostPerCall`.
 */
export function formatCostPerCall(
    costUsd: string,
    callCount: number,
    locale?: string,
): string | null {
    if (callCount <= 0) return null;
    return formatPreciseUsd(toFinite(costUsd) / callCount, locale);
}

export function formatTokens(n: number, locale?: string): string {
    const value = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(value);
}

export function formatPercent(n: number, locale?: string): string {
    const value = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat(locale, {
        style: "percent",
        minimumFractionDigits: PERCENT_FRACTION,
        maximumFractionDigits: PERCENT_FRACTION,
    }).format(value);
}

/**
 * Whole-number percent formatter used by the dashboard tiles (e.g. delta
 * versus prior month, share-of-cap, week-over-week pace). Distinct from
 * `formatPercent`, which always shows one fractional digit.
 */
const WHOLE_PERCENT_FMT = new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: 0,
});

/**
 * Whole-dollar USD formatter for headline numbers on the dashboard (Runway
 * hero, cap denominators). For per-call or precise spend numbers, use
 * `formatUsd` instead.
 */
const WHOLE_USD_FMT = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
});

export function formatWholePercent(value: number): string {
    return WHOLE_PERCENT_FMT.format(Number.isFinite(value) ? value : 0);
}

export function formatWholeUsd(value: number): string {
    return WHOLE_USD_FMT.format(Number.isFinite(value) ? value : 0);
}

/**
 * USD formatter for dashboard headlines and tiles. Sub-$100 keeps cents (and
 * sub-cent precision via `formatUsd`); $100+ drops cents for visual clarity.
 */
export function formatDashboardUsd(value: number): string {
    const v = Number.isFinite(value) ? value : 0;
    if (v <= 0) return formatWholeUsd(0);
    if (v < 100) return formatUsd(v);
    return formatWholeUsd(v);
}

/**
 * Percent formatter for dashboard ratios. Renders sub-1% positive values as
 * "<1%" instead of rounding to "0%", which would hide that any spend exists.
 */
export function formatDashboardPercent(ratio: number): string {
    const r = Number.isFinite(ratio) ? ratio : 0;
    if (r > 0 && r < 0.01) return "<1%";
    return formatWholePercent(r);
}

/**
 * Formats a signed delta with an explicit `+` for positive values, using the
 * whole-number percent style. Negative values keep the locale's own minus sign
 * (Intl handles that). Zero renders as `0%`.
 */
export function formatSignedPercent(delta: number): string {
    const formatted = formatWholePercent(delta);
    return delta > 0 ? `+${formatted}` : formatted;
}

export function formatUtcHhMm(d: Date): string {
    const hh = d.getUTCHours().toString().padStart(2, "0");
    const mm = d.getUTCMinutes().toString().padStart(2, "0");
    return `${hh}:${mm}`;
}

export function formatWindowRange(start: Date, end: Date): string {
    return `${formatUtcHhMm(start)}-${formatUtcHhMm(end)} UTC`;
}

export interface WindowLine {
    readonly windowStart: Date;
    readonly windowEnd: Date;
    readonly windowCostUsd: number;
}

export function formatWindowLine(window: WindowLine): string {
    return `${formatUsd(window.windowCostUsd)} spent between ${formatWindowRange(window.windowStart, window.windowEnd)}`;
}

// Already-percent input; 1 decimal unless the value is whole.
export function formatAlertPercent(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
});

const DATE_TIME_FMT = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
});

export function formatDate(at: Date): string {
    return DATE_FMT.format(at);
}

export function formatDateTime(at: Date): string {
    return DATE_TIME_FMT.format(at);
}

const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const RELATIVE_JUST_NOW_SEC = 5;

/**
 * Renders a Date as "2 hours ago", "in 5 minutes", "just now", etc. via
 * `Intl.RelativeTimeFormat`. Used by activity feeds and alert rows.
 */
export function formatRelativeTime(at: Date, nowMs: number = Date.now()): string {
    const diffMs = at.getTime() - nowMs;
    const absSec = Math.abs(diffMs) / 1000;

    if (absSec < RELATIVE_JUST_NOW_SEC) return "just now";

    const sign = diffMs < 0 ? -1 : 1;

    if (absSec < 60) return RTF.format(sign * Math.round(absSec), "second");
    const absMin = absSec / 60;
    if (absMin < 60) return RTF.format(sign * Math.round(absMin), "minute");
    const absHr = absMin / 60;
    if (absHr < 24) return RTF.format(sign * Math.round(absHr), "hour");
    const absDay = absHr / 24;
    return RTF.format(sign * Math.round(absDay), "day");
}
