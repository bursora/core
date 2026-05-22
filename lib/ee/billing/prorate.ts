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

/**
 * Number of UTC days in the closed range [from, to]. Both ends inclusive
 * — a signup at the very end of the month covers one day, not zero.
 * Negative ranges return 0.
 */
export function daysActiveInclusive(from: Date, to: Date): number {
    const dayStart = (d: Date): number =>
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const diffMs = dayStart(to) - dayStart(from);
    if (diffMs < 0) return 0;
    return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}
