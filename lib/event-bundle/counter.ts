/**
 * Pure functions for the event-bundle accounting. Math here only — no I/O,
 * no Redis, no Drizzle. Unit-testable in isolation and shared between the
 * middleware (write) and the banner (read).
 */

/**
 * Fixed fair-use cap: events included free with a cloud subscription, per
 * calendar month. Flat pricing means there is no overage charge past this
 * line — the cap drives the dashboard warning only; ingest never blocks.
 */
export const BUNDLE_EVENTS_PER_MONTH = 5_000_000;

const APPROACHING_BUNDLE_RATIO = 0.8;

export type EventBundleBannerLevel = "none" | "approaching" | "exhausted";

/**
 * Fair-use banner ladder:
 *   - >= 80% bundle (4M+)  → "approaching"
 *   - >= 100% bundle (5M+) → "exhausted"
 *
 * "exhausted" is the top of the ladder. Past the bundle the operator reaches
 * out, but the SDK keeps protecting spend — a billing limit must never take
 * down a customer's spend protection.
 */
export function bannerLevel(eventsCount: number): EventBundleBannerLevel {
    if (eventsCount >= BUNDLE_EVENTS_PER_MONTH) return "exhausted";
    if (eventsCount >= BUNDLE_EVENTS_PER_MONTH * APPROACHING_BUNDLE_RATIO) {
        return "approaching";
    }
    return "none";
}

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Format YYYY-MM for the given Date in UTC. Calendar months are timezone-
 * agnostic in this context. Throws on invalid Date; defensive only, since a
 * well-formed Date can never produce a bad key.
 */
export function monthKey(at: Date): string {
    const y = at.getUTCFullYear();
    const m = (at.getUTCMonth() + 1).toString().padStart(2, "0");
    const key = `${y}-${m}`;
    if (!MONTH_KEY_PATTERN.test(key)) {
        throw new Error(`monthKey: produced invalid key "${key}" from Date input`);
    }
    return key;
}
