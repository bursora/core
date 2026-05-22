/**
 * Pure bill calculation for cloud workspaces.
 *
 * Math only — no I/O, no Stripe, no Drizzle. Unit-testable in isolation.
 * The dollar inputs come from elsewhere (`tracked_spend` summed from
 * `usage_events`, event counts from `workspace_event_bundle_usage`).
 *
 * Formula:
 *   percentage = clamp(0.5% × tracked_spend, $29, $499)
 *   overage    = max(0, events - 5_000_000) × $0.30 / 1000
 *   bill       = percentage + overage
 *
 * The $29 floor guards against pricing overrides that game the spend
 * total to $0 — the floor still applies after the override-adjusted
 * sum, so the customer always pays something.
 */
import { overageCentsAt } from "@/lib/event-bundle/counter";
import type { BillCalculationInput, BillCalculationResult } from "./types";

/** Percentage of tracked spend that the customer pays Bursora. */
export const PERCENTAGE = 0.005;
/** Floor of the percentage component, in cents. $29. */
export const FLOOR_CENTS = 2900;
/** Cap of the percentage component, in cents. $499. */
export const CAP_CENTS = 49900;

/**
 * Raw 0.5% of `trackedSpendCents`, rounded to the nearest cent, with no
 * clamp applied. Pro-rated rollups call this to take the unclamped figure
 * and then apply their own clamp envelope.
 */
export function rawPercentageCents(trackedSpendCents: number): number {
    return Math.round(Math.max(0, trackedSpendCents) * PERCENTAGE);
}

/**
 * Compute the percentage component. `trackedSpendCents` is multiplied by
 * 0.5% and rounded to the nearest cent, then clamped to [floor, cap]. The
 * floor applies even when the input is zero or negative, so a workspace
 * that overrode every model to $0 still pays $29.
 */
export function percentageCents(trackedSpendCents: number): number {
    return clampPercentage(rawPercentageCents(trackedSpendCents), FLOOR_CENTS, CAP_CENTS);
}

/** Clamp a raw percentage figure to the supplied envelope. */
export function clampPercentage(raw: number, floorCents: number, capCents: number): number {
    if (raw < floorCents) return floorCents;
    if (raw > capCents) return capCents;
    return raw;
}

export function calculateMonthlyBill(input: BillCalculationInput): BillCalculationResult {
    const pct = percentageCents(input.trackedSpendCents);
    const over = overageCentsAt(input.eventsCount);
    return { percentageCents: pct, overageCents: over, totalCents: pct + over };
}
