/**
 * Provider-agnostic port for the upstream payment platform.
 *
 * The billing use cases depend on this interface; the Lemon Squeezy adapter
 * implements it. Tests use an in-memory fake. The neutral `WebhookEvent`
 * shape lets the rest of the system stay ignorant of provider-specific event
 * names — implementations project provider-native payloads onto this shape.
 */

export type WebhookEventType =
    | "subscription.activated"
    | "subscription.updated"
    | "subscription.canceled"
    | "subscription.expired"
    | "payment.succeeded"
    | "payment.failed"
    | "order.refunded"
    | "unknown";

/**
 * Provider-neutral projection of a webhook event. Fields irrelevant to a
 * given event type are left undefined.
 */
export interface WebhookEvent {
    /**
     * Provider-issued event id. Used as the idempotency key — providers
     * retry on failure and this id is stable across retries of the same
     * logical event.
     */
    readonly id: string;
    readonly type: WebhookEventType;
    /**
     * Subscribing user id, echoed back via checkout `custom_data` on the
     * first-activation event. Absent on recurring events (renewal, cancel),
     * which resolve the user by `customerId` instead.
     */
    readonly userId?: string | null;
    readonly customerId?: string | null;
    readonly subscriptionId?: string | null;
    readonly status?: string | null;
    /** Set on payment.* events. Provider invoice id. */
    readonly invoiceId?: string | null;
}

export interface CheckoutSessionInput {
    readonly userId: string;
    readonly userEmail: string;
    /**
     * Provider-specific identifier for the SKU/plan being subscribed to.
     * Lemon Squeezy: a Variant id (each plan has one or more variants).
     */
    readonly variantId: string;
    readonly successUrl: string;
    readonly cancelUrl: string;
}

export interface CheckoutSessionResult {
    readonly id: string;
    readonly url: string;
}

export interface PortalSessionInput {
    readonly customerId: string;
    readonly returnUrl: string;
}

export interface PortalSessionResult {
    readonly url: string;
}

export interface VerifyEventInput {
    readonly rawBody: string;
    readonly signatureHeader: string;
}

/**
 * Outcome of a boot-time credential probe. `ok` means the configured key
 * authenticated against the provider. `unauthorized` means the provider
 * rejected the key (rotated, revoked, or wrong-environment) — distinct from
 * a transient/network failure, which the adapter surfaces as a thrown error
 * so ops can tell a dead key apart from a flaky upstream.
 */
export type VerifyCredentialsResult =
    | { readonly ok: true }
    | {
          readonly ok: false;
          readonly reason: "unauthorized";
      };

/**
 * Port for talking to the upstream payment provider. The application layer
 * depends on this; the infrastructure layer implements it against a real
 * provider SDK. Tests use an in-memory fake.
 *
 * Operations:
 *   - Checkout/Portal session creation
 *   - Webhook signature verification + event projection
 */
export interface PaymentProviderAdapter {
    createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult>;
    createPortalSession(input: PortalSessionInput): Promise<PortalSessionResult>;
    /**
     * Verifies the provider signature against `rawBody` and the configured
     * webhook secret, then projects the event into the neutral shape above.
     * Throws on signature mismatch — the route turns the throw into a 400.
     */
    verifyAndParseEvent(input: VerifyEventInput): WebhookEvent;
    /**
     * Make one cheap authenticated call to confirm the configured API key
     * works. Returns `{ ok: true }` on success and
     * `{ ok: false, reason: "unauthorized" }` when the provider rejects the
     * key. Throws on transient/non-auth failures so callers can distinguish
     * a dead key from a flaky upstream. Used by the boot-time health check.
     */
    verifyCredentials(): Promise<VerifyCredentialsResult>;
}
