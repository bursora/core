/**
 * Public types and ports for the billing feature.
 *
 * Implementations live alongside in `app/lib/billing/`. The use cases
 * depend on these interfaces; the StripeApiAdapter and Drizzle
 * repositories supply the production wiring.
 */

import type { StripeWebhookEventStore } from "./stripe-webhook-event.store";
import type { TrackedSpendRepository } from "./tracked-spend.repository";
import type {
    EventBundleRollupRepository,
    WorkspaceBillingRepository,
} from "./workspace-billing.repository";

export interface CheckoutSessionInput {
    readonly workspaceId: string;
    readonly userEmail: string;
    readonly priceId: string;
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

export type StripeWebhookEventType =
    | "checkout.session.completed"
    | "customer.subscription.updated"
    | "customer.subscription.deleted"
    | "invoice.paid"
    | "invoice.payment_failed"
    | "invoice.finalization_failed"
    | "charge.refunded"
    | "unknown";

/**
 * Subset of fields the application needs from a Stripe event. Both
 * `customer.subscription.*`, `checkout.session.completed`, and `invoice.*`
 * map onto this shape; fields irrelevant to a given event type are left
 * undefined.
 */
export interface StripeWebhookEvent {
    /**
     * Stripe-issued event id (`evt_...`). Used as the idempotency key — Stripe
     * retries on failure, and this id is stable across retries of the same
     * logical event.
     */
    readonly id: string;
    readonly type: StripeWebhookEventType;
    readonly workspaceId?: string | null;
    readonly customerId?: string | null;
    readonly subscriptionId?: string | null;
    readonly status?: string | null;
    /** Set on `invoice.*` events. Stripe invoice id (`in_...`). */
    readonly invoiceId?: string | null;
}

export interface VerifyEventInput {
    readonly rawBody: string;
    readonly signatureHeader: string;
}

/**
 * One line item on a draft invoice. `amountCents` may be zero — the
 * caller is expected to skip a no-op line rather than push it. We round
 * cents to integers; Stripe rejects fractional cents.
 */
export interface InvoiceLineItem {
    readonly description: string;
    readonly amountCents: number;
}

export interface PushInvoiceInput {
    readonly customerId: string;
    /** Workspace id stamped into invoice metadata for traceability. */
    readonly workspaceId: string;
    /** YYYY-MM label of the billing period the invoice covers. */
    readonly periodMonth: string;
    readonly lineItems: readonly InvoiceLineItem[];
}

export interface PushInvoiceResult {
    /** Stripe invoice id (`in_...`). */
    readonly invoiceId: string;
}

export interface RefundAllInvoicesInput {
    readonly customerId: string;
    /** Optional Stripe-defined reason; defaults to `requested_by_customer`. */
    readonly reason?: string;
}

export interface RefundAllInvoicesResult {
    readonly refundedInvoiceIds: readonly string[];
    readonly totalCents: number;
}

/**
 * Port for talking to Stripe. The application layer depends on this; the
 * infrastructure layer in `cloud/billing/` implements it against the real
 * Stripe SDK. Tests use an in-memory fake.
 *
 * Operations:
 *   - Checkout/Portal session creation
 *   - Webhook signature verification + event mapping
 *   - Monthly invoice push (line items + finalize)
 */
export interface StripeAdapter {
    createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult>;
    createPortalSession(input: PortalSessionInput): Promise<PortalSessionResult>;
    /**
     * Verifies the Stripe-Signature header against `rawBody` and the configured
     * webhook secret, then maps the event into the narrow shape above. Throws
     * on signature mismatch — the route turns the throw into a 400.
     */
    verifyAndParseEvent(input: VerifyEventInput): StripeWebhookEvent;
    /**
     * Create invoice items for `customerId`, then create and finalize an
     * invoice covering those items. Used by the monthly rollup cron.
     * Returns the new invoice id so the caller can persist it on the
     * workspace billing state.
     */
    pushInvoice(input: PushInvoiceInput): Promise<PushInvoiceResult>;
    /**
     * Refund every paid invoice belonging to `customerId`. Idempotent:
     * invoices already fully refunded are skipped. Returns the ids of
     * invoices that produced a non-zero refund plus the summed refunded
     * amount in cents. Used by the money-back guarantee path.
     */
    refundAllInvoices(input: RefundAllInvoicesInput): Promise<RefundAllInvoicesResult>;
    /**
     * Cancel a Stripe subscription immediately (no end-of-period grace).
     * Idempotent: already-canceled subscriptions are treated as a no-op.
     * Used after issuing a refund — the customer got their money back so
     * service stops on the spot.
     */
    cancelSubscription(input: { subscriptionId: string }): Promise<void>;
}

export interface BillingDeps {
    readonly stripe: StripeAdapter;
    readonly workspaces: WorkspaceBillingRepository;
    readonly webhookEvents: StripeWebhookEventStore;
    readonly trackedSpend: TrackedSpendRepository;
    readonly eventBundleRollup: EventBundleRollupRepository;
    readonly priceIdTeam: string;
    readonly appUrl: string;
}

export interface CreateCheckoutSessionUseCaseInput {
    readonly workspaceId: string;
    readonly userEmail: string;
    readonly priceId: string;
    readonly successUrl: string;
    readonly cancelUrl: string;
    readonly stripe: StripeAdapter;
}

export interface CreateCheckoutSessionUseCaseResult {
    readonly id: string;
    readonly url: string;
}

export interface GetBillingPortalUrlUseCaseInput {
    readonly workspaceId: string;
    readonly returnUrl: string;
    readonly workspaces: WorkspaceBillingRepository;
    readonly stripe: StripeAdapter;
}

export interface GetBillingPortalUrlUseCaseResult {
    readonly url: string;
}

export interface HandleStripeWebhookUseCaseInput {
    readonly rawBody: string;
    readonly signatureHeader: string;
    readonly stripe: StripeAdapter;
    readonly workspaces: WorkspaceBillingRepository;
    readonly webhookEvents: StripeWebhookEventStore;
}

export interface HandleStripeWebhookUseCaseResult {
    readonly verified: boolean;
    readonly deduped?: boolean;
}

/**
 * Inputs to the pure bill calculator. Lives in the public types module
 * so test code and dashboards can construct expected results without
 * pulling the cloud overlay in.
 */
export interface BillCalculationInput {
    readonly trackedSpendCents: number;
    readonly eventsCount: number;
}

export interface BillCalculationResult {
    readonly percentageCents: number;
    readonly overageCents: number;
    readonly totalCents: number;
}

/** One workspace's tally for a billing month. */
export interface BillUsageRollup {
    readonly workspaceId: string;
    /** YYYY-MM. */
    readonly month: string;
    readonly trackedSpendCents: number;
    readonly eventsCount: number;
    readonly percentageCents: number;
    readonly overageCents: number;
    readonly totalCents: number;
    /** Stripe invoice id when the rollup pushed one; null when the bill was $0
     * (impossible given the floor) or the push failed and was retried later. */
    readonly invoiceId: string | null;
}

/** Live month-to-date estimate shown in the settings UI. */
export interface NextBillEstimate {
    /** YYYY-MM of the current cycle. */
    readonly month: string;
    readonly trackedSpendCents: number;
    readonly eventsCount: number;
    readonly percentageCents: number;
    readonly overageCents: number;
    readonly totalCents: number;
}

export interface RollupBillUseCaseInput {
    /** Reference date inside the month being billed. The use case derives
     * the [periodStart, periodEnd) window in UTC. */
    readonly now: Date;
    readonly stripe: StripeAdapter;
    readonly workspaces: WorkspaceBillingRepository;
    readonly trackedSpend: TrackedSpendRepository;
    readonly eventBundleRollup: EventBundleRollupRepository;
}

export interface RollupBillUseCaseResult {
    readonly month: string;
    readonly processed: number;
    readonly skipped: number;
    readonly failed: number;
}

export interface NextBillEstimateUseCaseInput {
    readonly workspaceId: string;
    readonly now: Date;
    readonly trackedSpend: TrackedSpendRepository;
    readonly eventBundleRollup: EventBundleRollupRepository;
}

export interface RequestRefundUseCaseInput {
    readonly workspaceId: string;
    readonly reason?: string;
    readonly now?: Date;
    readonly stripe: StripeAdapter;
    readonly workspaces: WorkspaceBillingRepository;
}

export type RequestRefundStatus = "refunded" | "not_eligible" | "no_invoices";

export interface RequestRefundUseCaseResult {
    readonly status: RequestRefundStatus;
    readonly refundedInvoiceIds: readonly string[];
    readonly totalCents: number;
}
