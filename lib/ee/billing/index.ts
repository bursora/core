/**
 * Public API of the billing feature.
 *
 * Routes and settings UI import the bound entry points from
 * `./server` directly; this file ships the framework-free pieces:
 * types, schema re-exports, and pure use-case functions that tests
 * exercise with in-memory fakes.
 *
 * Anything that pulls Drizzle, the provider SDK, or `server-only` lives
 * in `./server` so tests can import this barrel without booting a server.
 */

export * from "./schema";

export type {
    BillCalculationInput,
    BillCalculationResult,
    BillUsageRollup,
    BillingDeps,
    CheckoutSessionInput,
    CheckoutSessionResult,
    NextBillEstimate,
    NextBillEstimateUseCaseInput,
    PaymentProviderAdapter,
    PortalSessionInput,
    PortalSessionResult,
    RefundAllOrdersInput,
    RefundAllOrdersResult,
    ReportUsageInput,
    ReportUsageResult,
    RequestRefundStatus,
    RequestRefundUseCaseInput,
    RequestRefundUseCaseResult,
    RollupBillUseCaseInput,
    RollupBillUseCaseResult,
    VerifyEventInput,
    WebhookEvent,
    WebhookEventType,
} from "./types";

export type { BillingWebhookEventStore } from "./billing-webhook-event.store";
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
export { handleWebhookUseCase } from "./handle-webhook.usecase";
export { LemonSqueezyApiAdapter } from "./lemonsqueezy.adapter";
export { nextBillEstimateUseCase } from "./next-bill-estimate";
export { reportUsageUseCase } from "./report-usage.usecase";
export { requestRefundUseCase } from "./request-refund.usecase";
export { rollupBillUseCase } from "./rollup-bill.usecase";
