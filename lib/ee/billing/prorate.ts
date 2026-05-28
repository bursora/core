/**
 * Pro-rata math for partial months.
 *
 * Used for two cases:
 *   - mid-month signup → first invoice covers only days since signup
 *   - mid-month cancel → final invoice covers days from period start
 *                        to cancellation
 *
 * Both ends are pro-rated: floor and cap shrink linearly with the share
 * of the month covered. Percentage and overage components scale with the
 * raw inputs already (they sum across days), so only the clamp bounds
 * need pro-rating.
 */

export interface ProrateInput {
    /** Inclusive day count inside [periodStart, periodEnd]. */
    readonly daysActive: number;
    /** Total days in the calendar month. */
    readonly daysInMonth: number;
}

/**
 * Returns the fraction of the month covered, in [0, 1]. Defensive against
 * zero `daysInMonth` (never happens in real months but the math is
 * cleaner to guard).
 */
export function prorateFraction(input: ProrateInput): number {
    if (input.daysInMonth <= 0) return 0;
    const active = Math.max(0, Math.min(input.daysActive, input.daysInMonth));
    return active / input.daysInMonth;
}

/**
 * Days in the calendar month containing `at` (UTC). January → 31,
 * February in leap years → 29, etc. Computes via the
 * "first-of-next-month minus one day" trick.
 */
export function daysInUtcMonth(at: Date): number {
    const next = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
    next.setUTCDate(next.getUTCDate() - 1);
    return next.getUTCDate();
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Days since the epoch for the UTC calendar day containing `d`. */
function utcDayNumber(d: Date): number {
    return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / MS_PER_DAY);
}

/**
 * Whole UTC calendar days in the half-open range [from, to). Counts the day
 * of `from` and every day up to but not including the day of `to`. The
 * billing period end is the first-of-next-month at 00:00 UTC, so passing it
 * straight in counts exactly the active days with no boundary fudging.
 *
 * Both ends are floored to their UTC day number before subtracting, so a
 * DST shift in the caller's local zone can never move the count: the inputs
 * are read as UTC dates regardless of how they were built. Negative or
 * empty ranges return 0.
 */
export function utcDayDiff(from: Date, to: Date): number {
    const diff = utcDayNumber(to) - utcDayNumber(from);
    return diff < 0 ? 0 : diff;
}
