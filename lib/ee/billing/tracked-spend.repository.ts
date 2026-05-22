/**
 * Port for reading monthly tracked LLM spend per workspace.
 *
 * `sumMonthlySpendCents` sums `cost_usd` over a calendar month for one
 * workspace and returns the total in cents (integer). Pricing overrides
 * have already been applied at write time on `usage_events.cost_usd`, so
 * the sum here IS the override-adjusted figure — no post-aggregation
 * adjustment is needed.
 *
 * `listActiveCloudWorkspaceIds` enumerates workspaces eligible for an
 * invoice this cycle: those whose Stripe customer + subscription is set
 * and whose `subscription_status` is in the active set. The monthly
 * rollup cron iterates over this set.
 */

import "server-only";

export interface MonthlySpendQuery {
    readonly workspaceId: string;
    /** Inclusive lower bound (UTC). */
    readonly from: Date;
    /** Exclusive upper bound (UTC). */
    readonly to: Date;
}

export interface TrackedSpendRepository {
    /** Override-adjusted sum of `usage_events.cost_usd` in cents. */
    sumMonthlySpendCents(query: MonthlySpendQuery): Promise<number>;
    /**
     * Stripe-active workspaces. Active = `stripe_customer_id` set and
     * `subscription_status` in {`active`, `trialing`, `past_due`}.
     */
    listActiveCloudWorkspaceIds(): Promise<readonly string[]>;
}
