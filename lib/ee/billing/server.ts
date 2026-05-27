/**
 * Billing entry points.
 *
 * Routes and pages call these bound helpers instead of constructing the
 * provider adapter or repositories themselves. The helpers assemble the
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
import { DrizzleBillingWebhookEventStore } from "./drizzle-billing-webhook-event.store";
import { DrizzleTrackedSpendRepository } from "./drizzle-tracked-spend.repository";
import { DrizzleWorkspaceBillingRepository } from "./drizzle-workspace-billing.repository";
import { getBillingPortalUrlUseCase } from "./get-billing-portal-url.usecase";
import { handleWebhookUseCase } from "./handle-webhook.usecase";
import { LemonSqueezyApiAdapter } from "./lemonsqueezy.adapter";
import { nextBillEstimateUseCase } from "./next-bill-estimate";
import { requestRefundUseCase } from "./request-refund.usecase";
import { rollupBillUseCase } from "./rollup-bill.usecase";
import type { BillingWebhookEventStore } from "./billing-webhook-event.store";
import type { TrackedSpendRepository } from "./tracked-spend.repository";
import type {
    BillingDeps,
    NextBillEstimate,
    PaymentProviderAdapter,
    RequestRefundUseCaseResult,
    RollupBillUseCaseResult,
} from "./types";
import type {
    EventBundleRollupRepository,
    WorkspaceBillingRecord,
    WorkspaceBillingRepository,
} from "./workspace-billing.repository";

function buildDeps(): BillingDeps {
    const e = env();
    const apiKey = e.LEMONSQUEEZY_API_KEY;
    const webhookSecret = e.LEMONSQUEEZY_WEBHOOK_SECRET;
    const webhookSecretNext = e.LEMONSQUEEZY_WEBHOOK_SECRET_NEXT;
    const storeId = e.LEMONSQUEEZY_STORE_ID;
    const variantId = e.LEMONSQUEEZY_VARIANT_ID;
    if (!apiKey || !webhookSecret || !storeId || !variantId) {
        throw new Error(
            "billing is not configured: LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_WEBHOOK_SECRET, LEMONSQUEEZY_STORE_ID, and LEMONSQUEEZY_VARIANT_ID must be set",
        );
    }
    const database = db();
    return {
        provider: new LemonSqueezyApiAdapter({
            apiKey,
            webhookSecret,
            ...(webhookSecretNext.length > 0 ? { webhookSecretNext } : {}),
            storeId,
        }),
        workspaces: new DrizzleWorkspaceBillingRepository(database),
        webhookEvents: new DrizzleBillingWebhookEventStore(database),
        trackedSpend: new DrizzleTrackedSpendRepository(database),
        eventBundleRollup: new DrizzleEventBundleRollupRepository(database),
        variantIdTeam: variantId,
        appUrl: e.NEXT_PUBLIC_APP_URL,
    };
}

let testOverride: BillingDeps | null = null;

/**
 * Inject test-only deps. Pass `null` to clear and revert to production wiring.
 * Only intended for use from `tests/`. Throws at runtime if anything outside
 * the test environment tries to call this — production traffic must never
 * see an injected override.
 */
export function setBillingDepsForTesting(deps: BillingDeps | null): void {
    if (process.env.NODE_ENV !== "test") {
        throw new Error("setBillingDepsForTesting only available in test");
    }
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
        variantId: deps.variantIdTeam,
        successUrl: settingsUrl(input.workspaceId, "ok"),
        cancelUrl: settingsUrl(input.workspaceId, "cancel"),
        provider: deps.provider,
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
        provider: deps.provider,
    });
}

export async function handleWebhook(input: {
    rawBody: string;
    signatureHeader: string;
}): Promise<{ verified: boolean; deduped?: boolean }> {
    const deps = billingDeps();
    return handleWebhookUseCase({
        rawBody: input.rawBody,
        signatureHeader: input.signatureHeader,
        provider: deps.provider,
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
        provider: deps.provider,
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
 * Execute the money-back guarantee. Refunds every paid order on file,
 * cancels the subscription at end-of-period, marks the workspace canceled
 * in the DB (so the rollup cron stops reporting usage), and clears the
 * eligibility window so the action is single-use.
 */
export async function requestRefund(input: {
    workspaceId: string;
}): Promise<RequestRefundUseCaseResult> {
    const deps = billingDeps();
    return requestRefundUseCase({
        workspaceId: input.workspaceId,
        provider: deps.provider,
        workspaces: deps.workspaces,
    });
}

export type {
    BillingDeps,
    BillingWebhookEventStore,
    EventBundleRollupRepository,
    PaymentProviderAdapter,
    TrackedSpendRepository,
    WorkspaceBillingRecord,
    WorkspaceBillingRepository,
};
