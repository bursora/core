/**
 * Public types for the billing feature.
 *
 * Implementations live alongside in `lib/ee/billing/`. The use cases
 * depend on these interfaces; the LemonSqueezyApiAdapter and Drizzle
 * repositories supply the production wiring.
 *
 * The provider port (`PaymentProviderAdapter`) and its `WebhookEvent`
 * projection live in `./payment-provider.adapter` — re-exported here for
 * convenience.
 */

import type { PlanReadRepository } from "@/lib/plans/plan";
import type { BillingWebhookEventStore } from "./billing-webhook-event.store";
import type { PaymentProviderAdapter } from "./payment-provider.adapter";
import type { WorkspaceBillingRepository } from "./workspace-billing.repository";

export type {
    CheckoutSessionInput,
    CheckoutSessionResult,
    PaymentProviderAdapter,
    PortalSessionInput,
    PortalSessionResult,
    VerifyCredentialsResult,
    VerifyEventInput,
    WebhookEvent,
    WebhookEventType,
} from "./payment-provider.adapter";

export interface BillingDeps {
    readonly provider: PaymentProviderAdapter;
    readonly workspaces: WorkspaceBillingRepository;
    readonly webhookEvents: BillingWebhookEventStore;
    readonly plans: PlanReadRepository;
    readonly appUrl: string;
}

export interface GetBillingPortalUrlUseCaseInput {
    readonly workspaceId: string;
    readonly returnUrl: string;
    readonly workspaces: WorkspaceBillingRepository;
    readonly provider: PaymentProviderAdapter;
}

export interface GetBillingPortalUrlUseCaseResult {
    readonly url: string;
}

export interface HandleWebhookUseCaseInput {
    readonly rawBody: string;
    readonly signatureHeader: string;
    readonly provider: PaymentProviderAdapter;
    readonly workspaces: WorkspaceBillingRepository;
    readonly webhookEvents: BillingWebhookEventStore;
}

export interface HandleWebhookUseCaseResult {
    readonly verified: boolean;
    readonly deduped?: boolean;
}
