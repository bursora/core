/**
 * Billing entry points.
 *
 * Routes and pages call these bound helpers instead of constructing the
 * Stripe adapter or repositories themselves. The helpers assemble the
 * production wiring on demand.
 *
 * Tests inject fakes via `setBillingDepsForTesting`.
 */

import "server-only";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { buildWorkspacePath } from "@/lib/routes";
import { createCheckoutSessionUseCase } from "./create-checkout-session.usecase";
import { DrizzleEventBundleRollupRepository } from "./drizzle-event-bundle-rollup.repository";
import { DrizzleStripeWebhookEventStore } from "./drizzle-stripe-webhook-event.store";
import { DrizzleTrackedSpendRepository } from "./drizzle-tracked-spend.repository";
import { DrizzleWorkspaceBillingRepository } from "./drizzle-workspace-billing.repository";
import { getBillingPortalUrlUseCase } from "./get-billing-portal-url.usecase";
import { handleStripeWebhookUseCase } from "./handle-stripe-webhook.usecase";
import { nextBillEstimateUseCase } from "./next-bill-estimate";
import { requestRefundUseCase } from "./request-refund.usecase";
import { rollupBillUseCase } from "./rollup-bill.usecase";
import type { StripeWebhookEventStore } from "./stripe-webhook-event.store";
import { StripeApiAdapter } from "./stripe.adapter";
import type { TrackedSpendRepository } from "./tracked-spend.repository";
import type {
    BillingDeps,
    NextBillEstimate,
    RequestRefundUseCaseResult,
    RollupBillUseCaseResult,
    StripeAdapter,
} from "./types";
import type {
    EventBundleRollupRepository,
    WorkspaceBillingRecord,
    WorkspaceBillingRepository,
} from "./workspace-billing.repository";

function buildDeps(): BillingDeps {
    const e = env();
    const secret = e.STRIPE_SECRET_KEY;
    const webhook = e.STRIPE_WEBHOOK_SECRET;
    const priceId = e.STRIPE_PRICE_ID_TEAM;
    if (!secret || !webhook || !priceId) {
        throw new Error(
            "billing is not configured: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PRICE_ID_TEAM must be set",
        );
    }
    const database = db();
    return {
        stripe: new StripeApiAdapter({ secretKey: secret, webhookSecret: webhook }),
        workspaces: new DrizzleWorkspaceBillingRepository(database),
        webhookEvents: new DrizzleStripeWebhookEventStore(database),
        trackedSpend: new DrizzleTrackedSpendRepository(database),
        eventBundleRollup: new DrizzleEventBundleRollupRepository(database),
        priceIdTeam: priceId,
        appUrl: e.NEXT_PUBLIC_APP_URL,
    };
}

let testOverride: BillingDeps | null = null;

/**
 * Inject test-only deps. Pass `null` to clear and revert to production wiring.
 * Only intended for use from `tests/`.
 */
export function setBillingDepsForTesting(deps: BillingDeps | null): void {
    testOverride = deps;
}

export function billingDeps(): BillingDeps {
    return testOverride ?? buildDeps();
}

const settingsUrl = (workspaceId: string, status: "ok" | "cancel"): string =>
    `${billingDeps().appUrl}${buildWorkspacePath(workspaceId, "settings")}?billing=${status}`;

export async function createCheckoutSession(input: {
    workspaceId: string;
    userEmail: string;
}): Promise<{ url: string }> {
    const deps = billingDeps();
    return createCheckoutSessionUseCase({
        workspaceId: input.workspaceId,
        userEmail: input.userEmail,
        priceId: deps.priceIdTeam,
        successUrl: settingsUrl(input.workspaceId, "ok"),
        cancelUrl: settingsUrl(input.workspaceId, "cancel"),
        stripe: deps.stripe,
    });
}

export async function getBillingPortalUrl(input: {
    workspaceId: string;
}): Promise<{ url: string }> {
    const deps = billingDeps();
    return getBillingPortalUrlUseCase({
        workspaceId: input.workspaceId,
        returnUrl: `${deps.appUrl}${buildWorkspacePath(input.workspaceId, "settings")}`,
        workspaces: deps.workspaces,
        stripe: deps.stripe,
    });
}

export async function handleStripeWebhook(input: {
    rawBody: string;
    signatureHeader: string;
}): Promise<{ verified: boolean; deduped?: boolean }> {
    const deps = billingDeps();
    return handleStripeWebhookUseCase({
        rawBody: input.rawBody,
        signatureHeader: input.signatureHeader,
        stripe: deps.stripe,
        workspaces: deps.workspaces,
        webhookEvents: deps.webhookEvents,
    });
}

/** Read a workspace's billing record. Returns `null` if the workspace does not exist. */
export async function getWorkspaceBillingRecord(
    workspaceId: string,
): Promise<WorkspaceBillingRecord | null> {
    return billingDeps().workspaces.findById(workspaceId);
}

/**
 * Run the monthly billing rollup over every active workspace. The cron
 * route calls this.
 */
export async function runBillingRollup(now: Date): Promise<RollupBillUseCaseResult> {
    const deps = billingDeps();
    return rollupBillUseCase({
        now,
        stripe: deps.stripe,
        workspaces: deps.workspaces,
        trackedSpend: deps.trackedSpend,
        eventBundleRollup: deps.eventBundleRollup,
    });
}

/** Live month-to-date bill estimate for one workspace. */
export async function getNextBillEstimate(input: {
    workspaceId: string;
    now?: Date;
}): Promise<NextBillEstimate> {
    const deps = billingDeps();
    return nextBillEstimateUseCase({
        workspaceId: input.workspaceId,
        now: input.now ?? new Date(),
        trackedSpend: deps.trackedSpend,
        eventBundleRollup: deps.eventBundleRollup,
    });
}

/**
 * Execute the money-back guarantee. Refunds every paid Stripe invoice,
 * cancels the subscription immediately, and clears the eligibility window
 * so the action is single-use.
 */
export async function requestRefund(input: {
    workspaceId: string;
    reason?: string;
}): Promise<RequestRefundUseCaseResult> {
    const deps = billingDeps();
    return requestRefundUseCase({
        workspaceId: input.workspaceId,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
        stripe: deps.stripe,
        workspaces: deps.workspaces,
    });
}

export type {
    BillingDeps,
    EventBundleRollupRepository,
    StripeAdapter,
    StripeWebhookEventStore,
    TrackedSpendRepository,
    WorkspaceBillingRecord,
    WorkspaceBillingRepository,
};
