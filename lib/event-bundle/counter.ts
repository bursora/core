/**
 * Pure functions for the event-bundle accounting. Math here only — no I/O,
 * no Redis, no Drizzle. Unit-testable in isolation and shared between the
 * middleware (write) and the banner (read).
 */

/** Events included free with a cloud subscription, per calendar month. */
export const BUNDLE_EVENTS_PER_MONTH = 5_000_000;

/**
 * Overage rate: $0.30 per 1,000 events past the bundle = 30 cents / 1,000
 * = 0.03 cents per event. We track cents (integer) so the rollup never
 * accrues floating-point drift. Each event past the bundle is worth 3/100
 * of a cent, so we round up after grouping events into "every 1000" steps.
 */
export const OVERAGE_CENTS_PER_1000 = 30;

const APPROACHING_BUNDLE_RATIO = 0.8;
const HEAVY_OVERAGE_BUNDLE_RATIO = 1.5;

export type EventBundleBannerLevel = "none" | "approaching" | "exhausted" | "heavy";

export interface BannerInput {
    readonly eventsCount: number;
    readonly hardCapHit: boolean;
}

/**
 * Banner threshold ladder:
 *   - >= 80% bundle (4M+)  → "approaching"
 *   - >= 100% bundle (5M+) → "exhausted"
 *   - >= 150% bundle (7.5M+) OR hard cap hit → "heavy"
 */
export function bannerLevel(input: BannerInput): EventBundleBannerLevel {
    if (input.hardCapHit) return "heavy";
    if (input.eventsCount >= BUNDLE_EVENTS_PER_MONTH * HEAVY_OVERAGE_BUNDLE_RATIO) return "heavy";
    if (input.eventsCount >= BUNDLE_EVENTS_PER_MONTH) return "exhausted";
    if (input.eventsCount >= BUNDLE_EVENTS_PER_MONTH * APPROACHING_BUNDLE_RATIO) {
        return "approaching";
    }
    return "none";
}

/**
 * Cents of overage accrued at the given event count. Events at or below the
 * bundle accrue zero. Past the bundle, every event is 0.03 cents; we ceil to
 * avoid undercharging due to integer arithmetic.
 */
export function overageCentsAt(eventsCount: number): number {
    const overageEvents = Math.max(0, eventsCount - BUNDLE_EVENTS_PER_MONTH);
    if (overageEvents === 0) return 0;
    return Math.ceil((overageEvents * OVERAGE_CENTS_PER_1000) / 1000);
}

/**
 * Returns true when an additional `nextEventCount` events would push accrued
 * overage past the workspace's hard cap. Pre-write check — the caller uses
 * this to decide whether to reject the batch before the DB write.
 *
 * Null cap → always false (no cap configured).
 */
export function wouldExceedHardCap(input: {
    readonly priorCount: number;
    readonly nextEventCount: number;
    readonly hardCapUsdCents: number | null;
}): boolean {
    if (input.hardCapUsdCents === null) return false;
    const projected = overageCentsAt(input.priorCount + input.nextEventCount);
    return projected > input.hardCapUsdCents;
}

/**
 * Format YYYY-MM for the given Date in UTC. Calendar months are timezone-
 * agnostic in this context.
 */
export function monthKey(at: Date): string {
    const y = at.getUTCFullYear();
    const m = (at.getUTCMonth() + 1).toString().padStart(2, "0");
    return `${y}-${m}`;
}
