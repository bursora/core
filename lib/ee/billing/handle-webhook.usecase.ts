import type { BillingWebhookEventStore } from "./billing-webhook-event.store";
import type { PaymentProviderAdapter, WebhookEvent } from "./payment-provider.adapter";
import type { WorkspaceBillingRepository } from "./workspace-billing.repository";

export interface HandleWebhookInput {
    readonly rawBody: string;
    readonly signatureHeader: string;
    readonly provider: PaymentProviderAdapter;
    readonly workspaces: WorkspaceBillingRepository;
    readonly webhookEvents: BillingWebhookEventStore;
}

export interface HandleWebhookResult {
    readonly verified: boolean;
    readonly deduped?: boolean;
}

const REFUND_WINDOW_DAYS = 30;

/**
 * Records subscription state on the workspace row from neutral webhook
 * events. Behaviour by event type:
 *   - subscription.activated   → store customer/sub ids, stamp
 *                                subscribed_at + refund_eligible_until
 *                                (signup + 30 days),
 *                                subscription_status='active'.
 *                                Mapped from `subscription_created` /
 *                                `subscription_resumed` /
 *                                `subscription_unpaused`.
 *   - subscription.updated     → write the provider status verbatim
 *                                (active, past_due, canceled, ...)
 *   - subscription.canceled    → subscription_status='canceled'
 *   - subscription.expired     → subscription_status='canceled'
 *   - payment.succeeded        → subscription_status='active' (back
 *                                from past_due if needed). Mapped from
 *                                `subscription_payment_success` recurring
 *                                renewals; the workspace is resolved by
 *                                customer id when LS omits workspace_id
 *                                from custom_data.
 *   - payment.failed           → subscription_status='past_due'
 *   - order.refunded           → subscription_status='canceled',
 *                                refund_eligible_until=null. The in-app
 *                                refund path already does this; the
 *                                handler covers refunds initiated from
 *                                the provider dashboard.
 *   - unknown                  → verified no-op
 *
 * Sig-mismatch returns `{ verified: false }` so the route can map it to 400
 * without leaking the underlying provider error.
 */
export async function handleWebhookUseCase(
    input: HandleWebhookInput,
): Promise<HandleWebhookResult> {
    let event: WebhookEvent;
    try {
        event = input.provider.verifyAndParseEvent({
            rawBody: input.rawBody,
            signatureHeader: input.signatureHeader,
        });
    } catch {
        return { verified: false };
    }

    // Idempotency guard: providers retry on any non-2xx and occasionally
    // re-deliver 2xx events. Record the event id atomically; if a row already
    // exists, treat this delivery as already processed and skip side effects.
    const isNew = await input.webhookEvents.recordIfNew({
        eventId: event.id,
        eventType: event.type,
    });
    if (!isNew) {
        return { verified: true, deduped: true };
    }

    switch (event.type) {
        case "subscription.activated":
            await onSubscriptionActivated(event, input.workspaces);
            break;
        case "subscription.updated":
            await onSubscriptionStatusChange(event, input.workspaces);
            break;
        case "subscription.canceled":
        case "subscription.expired":
            await onSubscriptionCanceled(event, input.workspaces);
            break;
        case "payment.succeeded":
            await onPaymentSucceeded(event, input.workspaces);
            break;
        case "payment.failed":
            await onPaymentFailed(event, input.workspaces);
            break;
        case "order.refunded":
            await onOrderRefunded(event, input.workspaces);
            break;
        case "unknown":
            break;
    }

    return { verified: true };
}

async function onSubscriptionActivated(
    event: WebhookEvent,
    workspaces: WorkspaceBillingRepository,
): Promise<void> {
    const existing = await resolveWorkspace(event, workspaces);
    if (!existing) return;
    const now = new Date();
    const refundUntil = new Date(now.getTime() + REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    await workspaces.update({
        workspaceId: existing.workspaceId,
        providerCustomerId: event.customerId ?? null,
        providerSubscriptionId: event.subscriptionId ?? null,
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
    event: WebhookEvent,
    workspaces: WorkspaceBillingRepository,
): Promise<void> {
    const target = await resolveWorkspace(event, workspaces);
    if (!target) return;
    await workspaces.update({
        workspaceId: target.workspaceId,
        subscriptionStatus: event.status ?? null,
    });
}

async function onSubscriptionCanceled(
    event: WebhookEvent,
    workspaces: WorkspaceBillingRepository,
): Promise<void> {
    const target = await resolveWorkspace(event, workspaces);
    if (!target) return;
    await workspaces.update({
        workspaceId: target.workspaceId,
        subscriptionStatus: "canceled",
    });
}

async function onPaymentSucceeded(
    event: WebhookEvent,
    workspaces: WorkspaceBillingRepository,
): Promise<void> {
    const target = await resolveWorkspace(event, workspaces);
    if (!target) return;
    await workspaces.update({
        workspaceId: target.workspaceId,
        subscriptionStatus: "active",
    });
}

async function onPaymentFailed(
    event: WebhookEvent,
    workspaces: WorkspaceBillingRepository,
): Promise<void> {
    const target = await resolveWorkspace(event, workspaces);
    if (!target) return;
    await workspaces.update({
        workspaceId: target.workspaceId,
        subscriptionStatus: "past_due",
    });
}

async function onOrderRefunded(
    event: WebhookEvent,
    workspaces: WorkspaceBillingRepository,
): Promise<void> {
    const target = await resolveWorkspace(event, workspaces);
    if (!target) return;
    // In-app refund path already cleared these fields; this only fires
    // meaningfully for refunds issued from the provider dashboard. Reach
    // the same end state either way.
    await workspaces.update({
        workspaceId: target.workspaceId,
        subscriptionStatus: "canceled",
        refundEligibleUntil: null,
    });
}

async function resolveWorkspace(event: WebhookEvent, workspaces: WorkspaceBillingRepository) {
    // Prefer the workspace_id LS echoed back via custom_data; fall back to the
    // provider customer id for events (notably subscription_payment_success)
    // that do not carry custom_data on every delivery.
    if (event.workspaceId) {
        const direct = await workspaces.findById(event.workspaceId);
        if (direct) return direct;
    }
    if (event.customerId) {
        return workspaces.findByProviderCustomerId(event.customerId);
    }
    return null;
}
