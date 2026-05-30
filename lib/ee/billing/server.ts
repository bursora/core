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
import { drizzlePlanRepository } from "@/lib/plans/drizzle-plan.repository";
import { buildWorkspacePath } from "@/lib/routes";
import { cache } from "react";
import type { BillingWebhookEventStore } from "./billing-webhook-event.store";
import { billingWebhookPruneCutoff } from "./billing-webhook-retention";
import { createCheckoutSessionUseCase } from "./create-checkout-session.usecase";
import { DrizzleBillingWebhookEventStore } from "./drizzle-billing-webhook-event.store";
import { DrizzleWorkspaceBillingRepository } from "./drizzle-workspace-billing.repository";
import { getBillingPortalUrlUseCase } from "./get-billing-portal-url.usecase";
import { handleWebhookUseCase } from "./handle-webhook.usecase";
import { LemonSqueezyApiAdapter } from "./lemonsqueezy.adapter";
import type { BillingDeps, PaymentProviderAdapter } from "./types";
import type {
    WorkspaceBillingRecord,
    WorkspaceBillingRepository,
} from "./workspace-billing.repository";

function buildDeps(): BillingDeps {
    const e = env();
    const apiKey = e.LEMONSQUEEZY_API_KEY;
    const webhookSecret = e.LEMONSQUEEZY_WEBHOOK_SECRET;
    const webhookSecretNext = e.LEMONSQUEEZY_WEBHOOK_SECRET_NEXT;
    const storeId = e.LEMONSQUEEZY_STORE_ID;
    if (!apiKey || !webhookSecret || !storeId) {
        throw new Error(
            "billing is not configured: LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_WEBHOOK_SECRET, and LEMONSQUEEZY_STORE_ID must be set",
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
        plans: drizzlePlanRepository(database),
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

/**
 * Probe the configured payment provider once to confirm its API key actually
 * authenticates. `env.ts` only proves the key is *present*; a rotated or
 * revoked key passes boot validation yet fails the first charge. This runs a
 * single cheap authenticated call so that failure surfaces loudly at boot
 * instead of silently when checkout or a refund fires.
 *
 * No-op off cloud: self-host installs have no provider to probe. On an
 * unauthorized key it logs a structured signal and throws so ops sees the
 * dead key. Transient/non-auth failures propagate as-is — a flaky upstream is
 * not a bad key, and the memoized wrapper clears its cache on any throw so a
 * later call retries rather than pinning a rejected promise for the process.
 */
export async function runBillingCredentialCheck(deps: {
    readonly isCloud: boolean;
    readonly provider: Pick<PaymentProviderAdapter, "verifyCredentials">;
}): Promise<void> {
    if (!deps.isCloud) return;
    const result = await deps.provider.verifyCredentials();
    if (!result.ok) {
        console.error("billing.credentials.invalid", {
            event: "billing.credentials.invalid",
            reason: result.reason,
        });
        throw new Error(
            `billing credential check failed: payment provider rejected the API key (${result.reason}). Rotate LEMONSQUEEZY_API_KEY.`,
        );
    }
}

let credentialCheck: Promise<void> | null = null;

/**
 * Boot hook: verify billing credentials once per process. Memoized so the
 * probe never runs per request — the webhook route calls this on its first
 * invocation and every later call resolves the cached promise. On failure the
 * cache is cleared so a transient error does not pin a rejected promise for
 * the life of the process.
 */
export function checkBillingCredentials(): Promise<void> {
    if (credentialCheck === null) {
        credentialCheck = runBillingCredentialCheck({
            isCloud: env().IS_CLOUD,
            provider: billingDeps().provider,
        }).catch((err: unknown) => {
            credentialCheck = null;
            throw err;
        });
    }
    return credentialCheck;
}

/** Test-only: reset the memoized credential check so each test starts fresh. */
export function resetBillingCredentialCheckForTesting(): void {
    credentialCheck = null;
}

const settingsUrl = (workspaceId: string, status: "ok" | "cancel"): string =>
    `${billingDeps().appUrl}${buildWorkspacePath(workspaceId, "settings")}?billing=${status}`;

/**
 * Open Lemon Squeezy checkout for the active Bursora Cloud plan. The variant is
 * resolved from the `plans` table (the daily sync's source of truth), charges
 * at checkout, and auto-renews on LS's side; Bursora records no bill of its
 * own. Throws `NoActiveCloudPlanError` when no plan is configured.
 */
export async function createCheckoutSession(input: {
    workspaceId: string;
    userEmail: string;
}): Promise<{ url: string }> {
    const deps = billingDeps();
    return createCheckoutSessionUseCase({
        workspaceId: input.workspaceId,
        userEmail: input.userEmail,
        successUrl: settingsUrl(input.workspaceId, "ok"),
        cancelUrl: settingsUrl(input.workspaceId, "cancel"),
        provider: deps.provider,
        plans: deps.plans,
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

/**
 * Read a workspace's billing record. Returns `null` if the workspace does not
 * exist. Wrapped in React `cache()` so the readers in one render — the
 * view-paywall gate and `BillingSection` — share a single query per request.
 */
export const getWorkspaceBillingRecord = cache(
    async (workspaceId: string): Promise<WorkspaceBillingRecord | null> =>
        billingDeps().workspaces.findById(workspaceId),
);

/**
 * Delete `billing_webhook_events` rows older than the retention window. The
 * daily prune cron calls this. Returns the number of rows removed so the
 * scheduler logs see what happened.
 */
export async function runBillingWebhookPrune(now: Date): Promise<{ rowsPruned: number }> {
    const deps = billingDeps();
    const rowsPruned = await deps.webhookEvents.pruneOlderThan(billingWebhookPruneCutoff(now));
    return { rowsPruned };
}

export type {
    BillingDeps,
    BillingWebhookEventStore,
    PaymentProviderAdapter,
    WorkspaceBillingRecord,
    WorkspaceBillingRepository,
};
