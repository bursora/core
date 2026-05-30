/**
 * Bursora-side plan defaults. This is the OUR-side half of a plan: the products
 * we track and the `config` we attach to each. Lemon Squeezy owns name, price,
 * description, interval, and currency; it never overrides anything here.
 *
 * One entry per LS product we sell. The sync use case looks up the matching
 * entry by product `name` and merges its `config` onto the row it upserts.
 * Name is the match key because it's the only product identifier stable across
 * Lemon Squeezy's test and live modes: product id and slug both differ per mode
 * (live slugs are random UUIDs), but the name we set carries over unchanged.
 */

import type { PlanConfig } from "./plan";

export interface TrackedPlan {
    /** Lemon Squeezy product name this plan maps to. Must match LS exactly. */
    readonly name: string;
    /** Bursora-side defaults merged onto the synced row. */
    readonly config: PlanConfig;
}

/**
 * Bursora Cloud: a flat plan whose name, price, and interval come from Lemon
 * Squeezy. The Bursora-side default is the 5M-events/month fair-use ceiling,
 * which LS does not model.
 */
export const TRACKED_PLANS: readonly TrackedPlan[] = [
    {
        name: "Bursora Cloud",
        config: {
            includedEventsPerMonth: 5_000_000,
        },
    },
] as const;
