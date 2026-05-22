/**
 * Public API of the billing feature.
 *
 * Routes and settings UI import the bound entry points from
 * `./server` directly; this file ships the framework-free pieces:
 * types, schema re-exports, and pure use-case functions that tests
 * exercise with in-memory fakes.
 *
 * Anything that pulls Drizzle, Stripe SDK, or `server-only` lives in
 * `./server` so tests can import this barrel without booting a server.
 */

export * from "./schema";

export type {
    BillCalculationInput,
    BillCalculationResult,
    BillUsageRollup,
    BillingDeps,
    CheckoutSessionInput,
    CheckoutSessionResult,
    InvoiceLineItem,
    NextBillEstimate,
    NextBillEstimateUseCaseInput,
    PortalSessionInput,
    PortalSessionResult,
    PushInvoiceInput,
    PushInvoiceResult,
    RefundAllInvoicesInput,
    RefundAllInvoicesResult,
    RequestRefundStatus,
    RequestRefundUseCaseInput,
    RequestRefundUseCaseResult,
    RollupBillUseCaseInput,
    RollupBillUseCaseResult,
    StripeAdapter,
    StripeWebhookEvent,
    StripeWebhookEventType,
    VerifyEventInput,
} from "./types";

export type { StripeWebhookEventStore } from "./stripe-webhook-event.store";
export type { MonthlySpendQuery, TrackedSpendRepository } from "./tracked-spend.repository";
export type {
    EventBundleRollupRepository,
    WorkspaceBillingRecord,
    WorkspaceBillingRepository,
    WorkspaceBillingUpdate,
} from "./workspace-billing.repository";

export { CAP_CENTS, FLOOR_CENTS, PERCENTAGE, calculateMonthlyBill } from "./calculate-bill";
export { createCheckoutSessionUseCase } from "./create-checkout-session.usecase";
export {
    BillingNotEnabledError,
    getBillingPortalUrlUseCase,
} from "./get-billing-portal-url.usecase";
export { handleStripeWebhookUseCase } from "./handle-stripe-webhook.usecase";
export { nextBillEstimateUseCase } from "./next-bill-estimate";
export { pushStripeInvoiceUseCase } from "./push-stripe-invoice.usecase";
export { requestRefundUseCase } from "./request-refund.usecase";
export { rollupBillUseCase } from "./rollup-bill.usecase";
export { StripeApiAdapter } from "./stripe.adapter";
