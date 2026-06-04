/**
 * Public API of the billing feature.
 *
 * Routes and settings UI import the bound entry points from
 * `./server` directly; this file ships the framework-free pieces:
 * types and pure use-case functions that tests exercise with
 * in-memory fakes.
 *
 * Anything that pulls Drizzle, the provider SDK, or `server-only` lives
 * in `./server` so tests can import this barrel without booting a server.
 */

export type {
    BillingDeps,
    CheckoutSessionInput,
    CheckoutSessionResult,
    PaymentProviderAdapter,
    PortalSessionInput,
    PortalSessionResult,
    VerifyCredentialsResult,
    VerifyEventInput,
    WebhookEvent,
    WebhookEventType,
} from "./types";

export type { BillingWebhookEventStore } from "./billing-webhook-event.store";
export type {
    UserBillingRecord,
    UserBillingRepository,
    UserBillingUpsert,
} from "./user-billing.repository";

export {
    BILLING_WEBHOOK_RETENTION_DAYS,
    billingWebhookPruneCutoff,
} from "./billing-webhook-retention";
export {
    cancelSubscriptionOnAccountDeletionUseCase,
    type RefundEligibleInfo,
} from "./cancel-subscription-on-account-deletion.usecase";
export {
    NoActiveCloudPlanError,
    createCheckoutSessionUseCase,
} from "./create-checkout-session.usecase";
export {
    BillingNotEnabledError,
    getBillingPortalUrlUseCase,
} from "./get-billing-portal-url.usecase";
export { handleWebhookUseCase } from "./handle-webhook.usecase";
export { LemonSqueezyApiAdapter } from "./lemonsqueezy.adapter";
