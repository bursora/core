/**
 * EE boundary for the onboarding plan step. Billing lives in `@/lib/ee`, which
 * the OSS build excludes; this module is the single allowlisted caller (see
 * `eslint.config.js`). Both helpers guard on `IS_CLOUD` / `OSS_BUILD` and reach
 * EE only through a dynamic import, so a self-host or OSS build never pulls
 * Lemon Squeezy code into its bundle.
 */

import "server-only";

import { isActiveSubscriptionStatus } from "@/lib/billing-status";
import { env } from "@/lib/env";

/**
 * Whether the signed-in user already has an active Bursora Cloud subscription.
 * Always false off cloud, so the plan step never surfaces on self-host.
 */
export async function isUserSubscribed(userId: string): Promise<boolean> {
    if (!env().IS_CLOUD || process.env.OSS_BUILD === "true") return false;
    const { getUserBillingRecord } = await import("@/lib/ee/billing/server");
    const record = await getUserBillingRecord(userId);
    return isActiveSubscriptionStatus(record?.subscriptionStatus ?? null);
}

/**
 * The user-scoped checkout server action, loaded on demand so the import only
 * resolves on cloud (where the plan step renders). Passed to the client plan
 * step as a form action.
 */
export async function getCheckoutAction(): Promise<() => Promise<void>> {
    const billing =
        process.env.OSS_BUILD === "true" ? null : await import("@/lib/ee/billing-actions");
    if (!billing) throw new Error("Cloud billing is unavailable in self-host builds.");
    return billing.createCheckoutAction;
}
