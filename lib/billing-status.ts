/**
 * Subscription-status vocabulary shared between the billing UI and the
 * view-paywall lock check.
 *
 * `subscriptionStatus` mirrors the upstream provider's state verbatim
 * (`active`, `past_due`, `unpaid`, `paused`, `expired`) or one the webhook
 * handler writes itself (`canceled`, on explicit cancel/refund); `null`
 * means the workspace never opened Checkout. The "active" set is the subset
 * that grants access: a workspace whose payment is merely late (`past_due`,
 * `unpaid`) keeps its dashboard while the provider retries the charge.
 *
 * These are plain status strings with no EE dependency, so this module lives
 * outside `lib/ee` and is safe to import from non-EE callers (the lock check).
 */

export const ACTIVE_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
    "active",
    "past_due",
    "unpaid",
]);

/** True when the status grants dashboard access. `null` (never subscribed) is inactive. */
export function isActiveSubscriptionStatus(status: string | null | undefined): boolean {
    return status != null && ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}
