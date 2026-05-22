/**
 * Shared "in N hours/days" text for ETA badges and tick labels.
 *
 * Two dashboard surfaces speak the same urgency dialect: the
 * what-breaks-first stack and the runway timeline axis. Both round small
 * fractions of a day up to whole hours and longer durations to whole days,
 * pluralizing the unit. Keeping the helper in one place stops the two
 * surfaces from drifting apart.
 */

export const ETA_URGENT_DAYS = 1;
export const ETA_SOON_DAYS = 7;

const HOURS_PER_DAY = 24;

/**
 * Renders a positive day count as a short phrase: "in 7 hours" for any
 * value under one day, otherwise "in N days". Singular vs plural is
 * resolved on the rounded value, so 1 day reads "1 day" not "1 days".
 */
export function formatEtaHint(days: number): string {
    if (days < ETA_URGENT_DAYS) {
        const hours = Math.max(1, Math.round(days * HOURS_PER_DAY));
        return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
    }
    const rounded = Math.max(1, Math.round(days));
    return `in ${rounded} ${rounded === 1 ? "day" : "days"}`;
}
