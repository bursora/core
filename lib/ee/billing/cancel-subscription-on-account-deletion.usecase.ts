import type { PaymentProviderAdapter } from "./types";
import type { UserBillingRepository } from "./user-billing.repository";

/**
 * Subscription statuses that still bill (or would resume billing) on the
 * provider. Anything outside this set — `cancelled`, `expired`, or never
 * subscribed — needs no cancel call. Mirrors the statuses documented on
 * `UserBillingRecord.subscriptionStatus`.
 */
const BILLABLE_STATUSES = new Set(["active", "past_due", "unpaid", "paused"]);

export interface RefundEligibleInfo {
    readonly userId: string;
    readonly providerSubscriptionId: string;
    readonly providerCustomerId: string | null;
    readonly refundEligibleUntil: Date;
}

export interface CancelSubscriptionOnAccountDeletionInput {
    readonly userId: string;
    readonly now: Date;
    readonly users: UserBillingRepository;
    readonly provider: PaymentProviderAdapter;
    /**
     * Called when the purged account was still inside its money-back window.
     * Refunds are issued by support from the Lemon Squeezy dashboard (LS ships
     * no programmatic refund), so the caller flags the case for manual review
     * rather than issuing a refund here. Carries only provider-side ids, which
     * survive the Postgres erase.
     */
    readonly onRefundEligible?: (info: RefundEligibleInfo) => void;
}

export interface CancelSubscriptionOnAccountDeletionResult {
    /** True when an upstream cancel was issued (a billable subscription existed). */
    readonly canceled: boolean;
    /** True when the deletion fell inside the refund window. */
    readonly refundEligible: boolean;
}

/**
 * Cancel a deleting user's payment-provider subscription so it does not keep
 * billing after the local subscription row is erased. The account-purge hook
 * runs this just before the Postgres user delete, while the billing record
 * still exists.
 *
 * No row, no subscription id, or a terminal status → no-op. When the account
 * is still inside its money-back window, `onRefundEligible` fires so the caller
 * can queue a manual refund.
 */
export async function cancelSubscriptionOnAccountDeletionUseCase(
    input: CancelSubscriptionOnAccountDeletionInput,
): Promise<CancelSubscriptionOnAccountDeletionResult> {
    const record = await input.users.findByUserId(input.userId);
    const subscriptionId = record?.providerSubscriptionId;
    if (!record || !subscriptionId || !BILLABLE_STATUSES.has(record.subscriptionStatus ?? "")) {
        return { canceled: false, refundEligible: false };
    }

    await input.provider.cancelSubscription(subscriptionId);

    const until = record.refundEligibleUntil;
    if (until !== null && input.now <= until) {
        input.onRefundEligible?.({
            userId: input.userId,
            providerSubscriptionId: subscriptionId,
            providerCustomerId: record.providerCustomerId,
            refundEligibleUntil: until,
        });
        return { canceled: true, refundEligible: true };
    }

    return { canceled: true, refundEligible: false };
}
