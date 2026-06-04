import type { BillingWebhookEventStore } from "./billing-webhook-event.store";
import type { PaymentProviderAdapter, WebhookEvent } from "./payment-provider.adapter";
import type { UserBillingRepository } from "./user-billing.repository";

export interface HandleWebhookInput {
    readonly rawBody: string;
    readonly signatureHeader: string;
    readonly provider: PaymentProviderAdapter;
    readonly users: UserBillingRepository;
    readonly webhookEvents: BillingWebhookEventStore;
}

export interface HandleWebhookResult {
    readonly verified: boolean;
    readonly deduped?: boolean;
}

const REFUND_WINDOW_DAYS = 30;

/**
 * Records subscription state on the user's billing row from neutral webhook
 * events. The user is resolved from the checkout `custom_data` user id on
 * first activation, or by provider customer id on every later event. The row
 * is upserted, so no row need pre-exist. Behaviour by event type:
 *   - subscription.activated   → store customer/sub ids, stamp
 *                                subscribed_at + refund_eligible_until
 *                                (signup + 30 days). Subscription status
 *                                is taken from the event payload when
 *                                present (`active` on a paid checkout) and
 *                                defaults to `active` otherwise. Mapped from
 *                                `subscription_created` /
 *                                `subscription_resumed` /
 *                                `subscription_unpaused`.
 *   - subscription.updated     → write the provider status verbatim
 *                                (active, past_due, canceled, ...)
 *   - subscription.canceled    → subscription_status='canceled'
 *   - subscription.expired     → subscription_status='canceled'
 *   - payment.succeeded        → subscription_status='active' (back
 *                                from past_due if needed). Mapped from
 *                                `subscription_payment_success` recurring
 *                                renewals; the user is resolved by customer
 *                                id when LS omits custom_data.
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

    // The idempotency row is recorded; if any side effect throws, roll it back
    // so the route 500s, the provider retries, and the retry re-runs the event
    // instead of finding it recorded-as-handled and skipping it forever.
    try {
        switch (event.type) {
            case "subscription.activated":
                await onSubscriptionActivated(event, input.users);
                break;
            case "subscription.updated":
                await onSubscriptionStatusChange(event, input.users);
                break;
            case "subscription.canceled":
            case "subscription.expired":
                await onSubscriptionCanceled(event, input.users);
                break;
            case "payment.succeeded":
                await onPaymentSucceeded(event, input.users);
                break;
            case "payment.failed":
                await onPaymentFailed(event, input.users);
                break;
            case "order.refunded":
                await onOrderRefunded(event, input.users);
                break;
            case "unknown":
                break;
        }
    } catch (err) {
        await input.webhookEvents.deleteByEventId(event.id).catch((rollbackErr: unknown) => {
            console.error("billing.webhook.rollback_failed", {
                event: "billing.webhook.rollback_failed",
                eventId: event.id,
                message: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
            });
        });
        throw err;
    }

    return { verified: true };
}

async function onSubscriptionActivated(
    event: WebhookEvent,
    users: UserBillingRepository,
): Promise<void> {
    const userId = await resolveUserId(event, users);
    if (!userId) return;
    const existing = await users.findByUserId(userId);
    const now = new Date();
    const refundUntil = new Date(now.getTime() + REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    // Honor the provider-reported status when present; otherwise default to
    // `active` for back-compat with events that don't carry a status
    // (resumed/unpaused).
    const statusFromEvent =
        typeof event.status === "string" && event.status.length > 0 ? event.status : "active";
    await users.upsert({
        userId,
        // Write ids only when the event carries them, so a present id is never
        // clobbered with null (the activation event always carries both).
        ...providerIds(event),
        subscriptionStatus: statusFromEvent,
        // Stamp subscribed_at only on the first checkout. Re-checkouts after
        // a cancel keep the original signup timestamp; refund window does NOT
        // reset.
        ...(existing?.subscribedAt == null
            ? { subscribedAt: now, refundEligibleUntil: refundUntil }
            : {}),
    });
}

async function onSubscriptionStatusChange(
    event: WebhookEvent,
    users: UserBillingRepository,
): Promise<void> {
    const userId = await resolveUserId(event, users);
    if (!userId) return;
    await users.upsert({ userId, subscriptionStatus: event.status ?? null, ...providerIds(event) });
}

async function onSubscriptionCanceled(
    event: WebhookEvent,
    users: UserBillingRepository,
): Promise<void> {
    const userId = await resolveUserId(event, users);
    if (!userId) return;
    await users.upsert({ userId, subscriptionStatus: "canceled" });
}

async function onPaymentSucceeded(
    event: WebhookEvent,
    users: UserBillingRepository,
): Promise<void> {
    const userId = await resolveUserId(event, users);
    if (!userId) return;
    await users.upsert({ userId, subscriptionStatus: "active", ...providerIds(event) });
}

async function onPaymentFailed(event: WebhookEvent, users: UserBillingRepository): Promise<void> {
    const userId = await resolveUserId(event, users);
    if (!userId) return;
    await users.upsert({ userId, subscriptionStatus: "past_due", ...providerIds(event) });
}

async function onOrderRefunded(event: WebhookEvent, users: UserBillingRepository): Promise<void> {
    const userId = await resolveUserId(event, users);
    if (!userId) return;
    // In-app refund path already cleared these fields; this only fires
    // meaningfully for refunds issued from the provider dashboard. Reach
    // the same end state either way.
    await users.upsert({ userId, subscriptionStatus: "canceled", refundEligibleUntil: null });
}

/**
 * Customer + subscription ids to backfill from any event that carries them, so
 * a row never ends up active (or past_due) with a null id when LS delivers an
 * `updated` / `payment` event before — or instead of — the activation event.
 * Only present ids are written; the upsert leaves untouched fields alone. A
 * null/absent id is never written, so it can't clobber ids a prior event
 * already stored.
 */
function providerIds(event: WebhookEvent): {
    providerCustomerId?: string;
    providerSubscriptionId?: string;
} {
    return {
        ...(event.customerId ? { providerCustomerId: event.customerId } : {}),
        ...(event.subscriptionId ? { providerSubscriptionId: event.subscriptionId } : {}),
    };
}

async function resolveUserId(
    event: WebhookEvent,
    users: UserBillingRepository,
): Promise<string | null> {
    // Prefer the user_id LS echoed back via custom_data on first activation.
    // Later events (renewal, cancel, refund) carry no custom_data, so resolve
    // by the provider subscription id — it maps to exactly one user. Fall back
    // to the customer id only for events that carry no subscription id (e.g. a
    // dashboard order refund); with a shared customer that match is the first
    // owning row, which is acceptable for that rare path.
    if (event.userId) return event.userId;
    if (event.subscriptionId) {
        const record = await users.findByProviderSubscriptionId(event.subscriptionId);
        if (record) return record.userId;
    }
    if (event.customerId) {
        const record = await users.findByProviderCustomerId(event.customerId);
        return record?.userId ?? null;
    }
    return null;
}
