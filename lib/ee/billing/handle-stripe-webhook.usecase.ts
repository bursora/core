import type { StripeWebhookEventStore } from "./stripe-webhook-event.store";
import type { StripeAdapter, StripeWebhookEvent } from "./types";
import type { WorkspaceBillingRepository } from "./workspace-billing.repository";

export interface HandleStripeWebhookInput {
    readonly rawBody: string;
    readonly signatureHeader: string;
    readonly stripe: StripeAdapter;
    readonly workspaces: WorkspaceBillingRepository;
    readonly webhookEvents: StripeWebhookEventStore;
}

export interface HandleStripeWebhookResult {
    readonly verified: boolean;
    readonly deduped?: boolean;
}

const REFUND_WINDOW_DAYS = 30;

/**
 * Records Stripe subscription state on the workspace row. Behaviour by event
 * type:
 *   - checkout.session.completed         → store cus_/sub_ ids, stamp
 *                                          subscribed_at + refund_eligible_until
 *                                          (signup + 30 days),
 *                                          subscription_status='active'
 *   - customer.subscription.updated      → write the Stripe status verbatim
 *                                          (active, past_due, canceled, ...)
 *   - customer.subscription.deleted      → subscription_status='canceled'
 *   - invoice.paid                       → subscription_status='active' (back
 *                                          from past_due if needed)
 *   - invoice.payment_failed             → subscription_status='past_due'
 *   - invoice.finalization_failed        → verified no-op (operational
 *                                          signal; logged but no DB write)
 *   - charge.refunded                    → subscription_status='canceled',
 *                                          refund_eligible_until=null. The
 *                                          in-app refund path already does
 *                                          this; the handler covers refunds
 *                                          initiated from the Stripe dashboard.
 *   - anything else                      → verified no-op
 *
 * Sig-mismatch returns `{ verified: false }` so the route can map it to 400
 * without leaking the underlying Stripe error.
 */
export async function handleStripeWebhookUseCase(
    input: HandleStripeWebhookInput,
): Promise<HandleStripeWebhookResult> {
    let event: StripeWebhookEvent;
    try {
        event = input.stripe.verifyAndParseEvent({
            rawBody: input.rawBody,
            signatureHeader: input.signatureHeader,
        });
    } catch {
        return { verified: false };
    }

    // Idempotency guard: Stripe retries on any non-2xx and occasionally
    // re-delivers 2xx events. Record the event id atomically; if a row already
    // exists, treat this delivery as already processed and skip side effects.
    const isNew = await input.webhookEvents.recordIfNew({
        eventId: event.id,
        eventType: event.type,
    });
    if (!isNew) {
        return { verified: true, deduped: true };
    }

    switch (event.type) {
        case "checkout.session.completed":
            await onCheckoutCompleted(event, input.workspaces);
            break;
        case "customer.subscription.updated":
            await onSubscriptionStatusChange(event, input.workspaces);
            break;
        case "customer.subscription.deleted":
            await onSubscriptionDeleted(event, input.workspaces);
            break;
        case "invoice.paid":
            await onInvoicePaid(event, input.workspaces);
            break;
        case "invoice.payment_failed":
            await onInvoicePaymentFailed(event, input.workspaces);
            break;
        case "invoice.finalization_failed":
            console.warn("stripe.invoice.finalization_failed", {
                invoiceId: event.invoiceId,
                workspaceId: event.workspaceId,
            });
            break;
        case "charge.refunded":
            await onChargeRefunded(event, input.workspaces);
            break;
        case "unknown":
            break;
    }

    return { verified: true };
}

async function onCheckoutCompleted(
    event: StripeWebhookEvent,
    workspaces: WorkspaceBillingRepository,
): Promise<void> {
    if (!event.workspaceId) return;
    const existing = await workspaces.findById(event.workspaceId);
    if (!existing) return;
    const now = new Date();
    const refundUntil = new Date(now.getTime() + REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    await workspaces.update({
        workspaceId: event.workspaceId,
        stripeCustomerId: event.customerId ?? null,
        stripeSubscriptionId: event.subscriptionId ?? null,
        subscriptionStatus: "active",
        // Stamp subscribed_at only on the first checkout. Re-checkouts after
        // a cancel keep the original signup timestamp; refund window does NOT
        // reset.
        ...(existing.subscribedAt === null
            ? { subscribedAt: now, refundEligibleUntil: refundUntil }
            : {}),
    });
}

async function onSubscriptionStatusChange(
    event: StripeWebhookEvent,
    workspaces: WorkspaceBillingRepository,
): Promise<void> {
    const target = await resolveWorkspace(event, workspaces);
    if (!target) return;
    await workspaces.update({
        workspaceId: target.workspaceId,
        subscriptionStatus: event.status ?? null,
    });
}

async function onSubscriptionDeleted(
    event: StripeWebhookEvent,
    workspaces: WorkspaceBillingRepository,
): Promise<void> {
    const target = await resolveWorkspace(event, workspaces);
    if (!target) return;
    await workspaces.update({
        workspaceId: target.workspaceId,
        subscriptionStatus: "canceled",
    });
}

async function onInvoicePaid(
    event: StripeWebhookEvent,
    workspaces: WorkspaceBillingRepository,
): Promise<void> {
    const target = await resolveWorkspace(event, workspaces);
    if (!target) return;
    await workspaces.update({
        workspaceId: target.workspaceId,
        subscriptionStatus: "active",
    });
}

async function onInvoicePaymentFailed(
    event: StripeWebhookEvent,
    workspaces: WorkspaceBillingRepository,
): Promise<void> {
    const target = await resolveWorkspace(event, workspaces);
    if (!target) return;
    await workspaces.update({
        workspaceId: target.workspaceId,
        subscriptionStatus: "past_due",
    });
}

async function onChargeRefunded(
    event: StripeWebhookEvent,
    workspaces: WorkspaceBillingRepository,
): Promise<void> {
    const target = await resolveWorkspace(event, workspaces);
    if (!target) return;
    // In-app refund path already cleared these fields; this only fires
    // meaningfully for refunds issued from the Stripe dashboard. Reach the
    // same end state either way.
    await workspaces.update({
        workspaceId: target.workspaceId,
        subscriptionStatus: "canceled",
        refundEligibleUntil: null,
    });
}

async function resolveWorkspace(event: StripeWebhookEvent, workspaces: WorkspaceBillingRepository) {
    if (!event.customerId) return null;
    return workspaces.findByStripeCustomerId(event.customerId);
}
