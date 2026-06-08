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
import { getWorkspaceOwner } from "@/lib/identity/server";
import { drizzlePlanRepository } from "@/lib/plans/drizzle-plan.repository";
import type { BillingInterval } from "@/lib/plans/plan";
import * as Sentry from "@sentry/nextjs";
import { cache } from "react";
import type { BillingWebhookEventStore } from "./billing-webhook-event.store";
import { billingWebhookPruneCutoff } from "./billing-webhook-retention";
import { cancelSubscriptionOnAccountDeletionUseCase } from "./cancel-subscription-on-account-deletion.usecase";
import { createCheckoutSessionUseCase } from "./create-checkout-session.usecase";
import { DrizzleBillingWebhookEventStore } from "./drizzle-billing-webhook-event.store";
import { DrizzleUserBillingRepository } from "./drizzle-user-billing.repository";
import { getBillingPortalUrlUseCase } from "./get-billing-portal-url.usecase";
import { handleWebhookUseCase } from "./handle-webhook.usecase";
import { LemonSqueezyApiAdapter } from "./lemonsqueezy.adapter";
import type { BillingDeps, PaymentProviderAdapter } from "./types";
import type { UserBillingRecord, UserBillingRepository } from "./user-billing.repository";

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
        users: new DrizzleUserBillingRepository(database),
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

// Post-checkout landing: the signed-in user's workspace home, where the
// now-unlocked dashboard renders. The `?billing` flag is carried for parity
// with the in-app confirmation copy.
const landingUrl = (status: "ok" | "cancel"): string =>
    `${billingDeps().appUrl}/workspace?billing=${status}`;

/**
 * Open Lemon Squeezy checkout for the active Bursora Cloud plan on the chosen
 * billing interval (monthly or annual), keyed to the subscribing user. The
 * variant is resolved from the `plans` table (the daily sync's source of
 * truth), charges at checkout, and auto-renews on LS's side; Bursora records no
 * bill of its own. Throws `NoActiveCloudPlanError` when no plan matches.
 */
export async function createCheckoutSession(input: {
    userId: string;
    userEmail: string;
    interval: BillingInterval;
}): Promise<{ url: string }> {
    const deps = billingDeps();
    return createCheckoutSessionUseCase({
        userId: input.userId,
        userEmail: input.userEmail,
        interval: input.interval,
        successUrl: landingUrl("ok"),
        cancelUrl: landingUrl("cancel"),
        provider: deps.provider,
        plans: deps.plans,
    });
}

export async function getBillingPortalUrl(input: { userId: string }): Promise<{ url: string }> {
    const deps = billingDeps();
    return getBillingPortalUrlUseCase({
        userId: input.userId,
        returnUrl: `${deps.appUrl}/workspace`,
        users: deps.users,
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
        users: deps.users,
        webhookEvents: deps.webhookEvents,
    });
}

/**
 * Cancel a deleting user's Lemon Squeezy subscription so it stops billing once
 * the Postgres user row (and its subscription record) is erased. The
 * account-purge cron calls this through a cloud-only dynamic import, just
 * before the user delete. No active subscription → no-op.
 *
 * A deletion inside the money-back window is reported to Sentry for manual
 * review rather than auto-refunded: LS ships no programmatic refund, so support
 * issues it from the dashboard against the (provider-side) ids logged here.
 */
export async function cancelSubscriptionOnAccountDeletion(userId: string): Promise<void> {
    const deps = billingDeps();
    await cancelSubscriptionOnAccountDeletionUseCase({
        userId,
        now: new Date(),
        users: deps.users,
        provider: deps.provider,
        onRefundEligible: (info) => {
            Sentry.captureMessage("account deleted within refund window; issue manual refund", {
                level: "warning",
                tags: { area: "billing", step: "account-deletion-refund" },
                extra: {
                    userId: info.userId,
                    providerSubscriptionId: info.providerSubscriptionId,
                    providerCustomerId: info.providerCustomerId,
                    refundEligibleUntil: info.refundEligibleUntil.toISOString(),
                },
            });
        },
    });
}

/**
 * Read a user's billing record. Returns `null` when the user has never
 * subscribed. Wrapped in React `cache()` so readers in one render share a
 * single query per request: `BillingSection` reads the current user, and the
 * view-paywall gate reads the workspace owner — both route through here.
 */
export const getUserBillingRecord = cache(
    async (userId: string): Promise<UserBillingRecord | null> =>
        billingDeps().users.findByUserId(userId),
);

/**
 * Resolve the owner of a workspace and read their billing record. The cloud
 * view-paywall gate calls this: a workspace is unlocked iff its owner has an
 * active subscription. Returns `null` when the workspace has no owner row.
 *
 * Resolves the owner through the shared per-request cache (`getWorkspaceOwner`)
 * so a budget preflight that also runs the admin-owned bypass shares one
 * owner-resolution query instead of issuing a second.
 */
export const getWorkspaceOwnerBillingRecord = cache(
    async (workspaceId: string): Promise<UserBillingRecord | null> => {
        const owner = await getWorkspaceOwner(workspaceId);
        if (!owner) return null;
        return getUserBillingRecord(owner.userId);
    },
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
    UserBillingRecord,
    UserBillingRepository,
};
