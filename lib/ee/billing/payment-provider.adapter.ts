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
    readonly workspaceId?: string | null;
    readonly customerId?: string | null;
    readonly subscriptionId?: string | null;
    readonly status?: string | null;
    /** Set on payment.* events. Provider invoice id. */
    readonly invoiceId?: string | null;
}

export interface CheckoutSessionInput {
    readonly workspaceId: string;
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
 * Inputs to report one month of usage for a workspace. `totalCents` is the
 * exact monthly bill; the adapter converts it to LS usage units (1 unit =
 * $0.50). The workspace id rides along for log traceability; the provider
 * does not surface it back.
 */
export interface ReportUsageInput {
    readonly subscriptionId: string;
    readonly workspaceId: string;
    /** YYYY-MM label of the billing period the usage report covers. */
    readonly periodMonth: string;
    readonly totalCents: number;
}

export interface ReportUsageResult {
    /** Provider usage-record id. */
    readonly usageRecordId: string;
}

export interface RefundAllOrdersInput {
    readonly customerId: string;
}

export interface RefundAllOrdersResult {
    readonly refundedOrderIds: readonly string[];
    readonly totalCents: number;
}

/**
 * Port for talking to the upstream payment provider. The application layer
 * depends on this; the infrastructure layer implements it against a real
 * provider SDK. Tests use an in-memory fake.
 *
 * Operations:
 *   - Checkout/Portal session creation
 *   - Webhook signature verification + event projection
 *   - Monthly usage reporting against the subscription's metered item
 *   - Refund-all + subscription cancellation (money-back guarantee)
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
     * Report one month of usage for a workspace's subscription. Used by
     * the monthly rollup cron. The provider posts the value to the
     * metered subscription item and returns a usage-record id the caller
     * can persist for retry detection + deep-linking.
     */
    reportUsage(input: ReportUsageInput): Promise<ReportUsageResult>;
    /**
     * Refund every paid order belonging to `customerId`. Idempotent:
     * orders already fully refunded are skipped. Returns the ids of
     * orders that produced a non-zero refund plus the summed refunded
     * amount in cents. Used by the money-back guarantee path.
     */
    refundAllOrders(input: RefundAllOrdersInput): Promise<RefundAllOrdersResult>;
    /**
     * Cancel a subscription at the end of the current billing period.
     * Lemon Squeezy does not expose an immediate-cancel primitive; the
     * `DELETE /v1/subscriptions/{id}` call marks the subscription canceled
     * but lets the customer keep access until period end. Bursora
     * compensates by skipping `canceled`/`expired` workspaces in the
     * monthly rollup so no usage is reported after a refund.
     * Idempotent: already-canceled subscriptions are treated as a no-op.
     */
    cancelSubscription(input: { subscriptionId: string }): Promise<void>;
}
