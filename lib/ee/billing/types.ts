/**
 * Public types for the billing feature.
 *
 * Implementations live alongside in `app/lib/billing/`. The use cases
 * depend on these interfaces; the LemonSqueezyApiAdapter and Drizzle
 * repositories supply the production wiring.
 *
 * The provider port (`PaymentProviderAdapter`) and its `WebhookEvent`
 * projection live in `./payment-provider.adapter` — re-exported here for
 * convenience.
 */

import type { BillingWebhookEventStore } from "./billing-webhook-event.store";
import type { PaymentProviderAdapter } from "./payment-provider.adapter";
import type { TrackedSpendRepository } from "./tracked-spend.repository";
import type {
    EventBundleRollupRepository,
    WorkspaceBillingRepository,
} from "./workspace-billing.repository";

export type {
    CheckoutSessionInput,
    CheckoutSessionResult,
    PaymentProviderAdapter,
    PortalSessionInput,
    PortalSessionResult,
    RefundAllOrdersInput,
    RefundAllOrdersResult,
    ReportUsageInput,
    ReportUsageResult,
    VerifyCredentialsResult,
    VerifyEventInput,
    WebhookEvent,
    WebhookEventType,
} from "./payment-provider.adapter";

export interface BillingDeps {
    readonly provider: PaymentProviderAdapter;
    readonly workspaces: WorkspaceBillingRepository;
    readonly webhookEvents: BillingWebhookEventStore;
    readonly trackedSpend: TrackedSpendRepository;
    readonly eventBundleRollup: EventBundleRollupRepository;
    readonly variantIdTeam: string;
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
    /** Provider invoice id when the rollup pushed one; null when the bill was $0
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
    readonly provider: PaymentProviderAdapter;
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
    readonly now?: Date;
    readonly provider: PaymentProviderAdapter;
    readonly workspaces: WorkspaceBillingRepository;
}

export type RequestRefundStatus = "refunded" | "not_eligible" | "no_invoices";

export interface RequestRefundUseCaseResult {
    readonly status: RequestRefundStatus;
    readonly refundedOrderIds: readonly string[];
    readonly totalCents: number;
}
