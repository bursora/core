/**
 * Money-back guarantee execution path.
 *
 * Triggered by the refund button in workspace billing settings. Eligibility
 * is gated by `refund_eligible_until` (stamped on the workspace at first
 * checkout and never extended). Within the window the use case cancels the
 * Lemon Squeezy subscription (end-of-period; LS has no immediate-cancel
 * primitive), refunds every paid order on file, and clears the eligibility
 * timestamp so the action is single-use. The DB-side `subscriptionStatus`
 * flips to `canceled` immediately so the UI reflects the cancellation during
 * the leftover days LS lets the subscription run out.
 *
 * Eligibility is keyed off signup, not subscription status: a customer who
 * cancels through the Customer Portal mid-window can still claim a refund
 * for the orders they already paid.
 *
 * Failure semantics are atomic from the customer's perspective. If the
 * provider refuses any step we throw and leave the workspace row untouched;
 * the caller can retry safely because both cancelSubscription and
 * refundAllOrders are idempotent.
 */

import type { RequestRefundUseCaseInput, RequestRefundUseCaseResult } from "./types";

const emptyResult = (status: RequestRefundUseCaseResult["status"]): RequestRefundUseCaseResult => ({
    status,
    refundedOrderIds: [],
    totalCents: 0,
});

export async function requestRefundUseCase(
    input: RequestRefundUseCaseInput,
): Promise<RequestRefundUseCaseResult> {
    const record = await input.workspaces.findById(input.workspaceId);
    if (!record) {
        throw new Error(`workspace not found: ${input.workspaceId}`);
    }

    const now = input.now ?? new Date();
    if (
        record.refundEligibleUntil === null ||
        record.refundEligibleUntil.getTime() <= now.getTime()
    ) {
        return emptyResult("not_eligible");
    }
    if (!record.providerCustomerId) {
        return emptyResult("no_invoices");
    }

    if (record.providerSubscriptionId) {
        // Cancel first: marks the subscription cancelled at LS so no further
        // renewals fire. LS cancels at the end of the current period.
        // Already-cancelled subscriptions are absorbed by the adapter so this
        // is safe even if the customer cancelled through the portal earlier.
        await input.provider.cancelSubscription({
            subscriptionId: record.providerSubscriptionId,
        });
    }

    const refund = await input.provider.refundAllOrders({
        customerId: record.providerCustomerId,
    });

    if (refund.totalCents === 0) {
        // Customer has no paid orders to refund (all charges were already
        // refunded out-of-band). The cancel call above already ran, so mirror
        // that in the DB — leaving the row `active` would misrepresent the
        // workspace as subscribed during the leftover days LS lets the
        // cancelled subscription run out.
        const updates: {
            workspaceId: string;
            refundEligibleUntil: Date | null;
            subscriptionStatus?: string | null;
        } = {
            workspaceId: input.workspaceId,
            refundEligibleUntil: null,
        };
        if (record.providerSubscriptionId) {
            updates.subscriptionStatus = "canceled";
        }
        await input.workspaces.update(updates);
        return emptyResult("no_invoices");
    }

    await input.workspaces.update({
        workspaceId: input.workspaceId,
        subscriptionStatus: "canceled",
        refundEligibleUntil: null,
    });

    return {
        status: "refunded",
        refundedOrderIds: refund.refundedOrderIds,
        totalCents: refund.totalCents,
    };
}
