/**
 * Decide whether a workspace should be invoiced by the monthly rollup.
 *
 * Used by both `DrizzleTrackedSpendRepository.listActiveCloudWorkspaceIds`
 * (translated into a SQL WHERE clause) and the in-memory test fake, so the
 * filter rule has exactly one definition.
 *
 * `trialing` is the load-bearing case: a trial workspace that is still
 * inside its provider-issued trial window must NOT be billed, but a trial
 * whose end date has passed (LS keeps `trialing` status until the next
 * webhook arrives) should be billed. A trialing row that arrived without
 * `trial_ends_at` predates trial tracking — treat it as billable so we
 * don't silently skip pre-existing trials.
 */

export interface WorkspaceBillingStateForBilling {
    readonly subscriptionStatus: string | null;
    readonly trialEndsAt: Date | null;
}

export function isWorkspaceBillableNow(
    state: WorkspaceBillingStateForBilling,
    now: Date,
): boolean {
    const { subscriptionStatus, trialEndsAt } = state;
    if (subscriptionStatus === "active" || subscriptionStatus === "past_due") {
        return true;
    }
    if (subscriptionStatus === "trialing") {
        return trialEndsAt === null || trialEndsAt.getTime() <= now.getTime();
    }
    return false;
}
