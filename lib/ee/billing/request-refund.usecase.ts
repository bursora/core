/**
 * Money-back guarantee execution path.
 *
 * Triggered by the refund button in workspace billing settings. Eligibility
 * is gated by `refund_eligible_until` (stamped on the workspace at first
 * checkout and never extended). Within the window the use case refunds every
 * paid invoice on file, cancels the Stripe subscription immediately, and
 * clears the eligibility timestamp so the action is single-use.
 *
 * Eligibility is keyed off signup, not subscription status: a customer who
 * cancels through the Customer Portal mid-window can still claim a refund
 * for the charges they already paid.
 *
 * Failure semantics are atomic from the customer's perspective. If Stripe
 * refuses any step we throw and leave the workspace row untouched; the
 * caller can retry safely because refundAllInvoices is idempotent.
 */

import type { RequestRefundUseCaseInput, RequestRefundUseCaseResult } from "./types";

const emptyResult = (status: RequestRefundUseCaseResult["status"]): RequestRefundUseCaseResult => ({
    status,
    refundedInvoiceIds: [],
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
    if (!record.stripeCustomerId) {
        return emptyResult("no_invoices");
    }

    const refund = await input.stripe.refundAllInvoices({
        customerId: record.stripeCustomerId,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });

    if (refund.totalCents === 0) {
        // Customer has no paid invoices to refund (subscribed but never billed,
        // or all charges were already refunded out-of-band). Still clear the
        // eligibility window so the panel disappears.
        await input.workspaces.update({
            workspaceId: input.workspaceId,
            refundEligibleUntil: null,
        });
        return emptyResult("no_invoices");
    }

    if (record.stripeSubscriptionId) {
        // Already-canceled subscriptions are absorbed by the adapter so this
        // is safe even if the customer canceled through the portal earlier.
        await input.stripe.cancelSubscription({ subscriptionId: record.stripeSubscriptionId });
    }

    await input.workspaces.update({
        workspaceId: input.workspaceId,
        subscriptionStatus: "canceled",
        refundEligibleUntil: null,
    });

    return {
        status: "refunded",
        refundedInvoiceIds: refund.refundedInvoiceIds,
        totalCents: refund.totalCents,
    };
}
