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
import { getUserRole } from "@/lib/identity/server";
import { roleGrantsFreeAccess, USER_ROLE } from "@/lib/identity/user-role";

/**
 * Whether the signed-in user clears the onboarding pay-step — an active Bursora
 * Cloud subscription, an admin (operator) account, or a beta account (free,
 * full-featured comp). Always false off cloud, so the plan step never surfaces
 * on self-host.
 *
 * Admin is checked explicitly rather than folded into `roleGrantsFreeAccess`:
 * that predicate is beta-only (the dashboard "Beta" badge keys off it, and
 * admin's enforcement exemptions run through separate owner/session axes). For
 * the subscribe-step both admin and beta skip paying, mirroring the view
 * paywall, which lets an admin session through and unlocks beta-owned spaces.
 *
 * The role read runs before the billing read so an admin/beta user skips the EE
 * billing query entirely; it's a plain identity read, so the OSS build still
 * never pulls EE into a self-host bundle.
 */
export async function userHasCloudAccess(userId: string): Promise<boolean> {
    if (!env().IS_CLOUD || process.env.OSS_BUILD === "true") return false;
    const role = await getUserRole(userId);
    if (role === USER_ROLE.admin || roleGrantsFreeAccess(role)) return true;
    const { getUserBillingRecord } = await import("@/lib/ee/billing/server");
    const record = await getUserBillingRecord(userId);
    return isActiveSubscriptionStatus(record?.subscriptionStatus ?? null);
}

/**
 * The user-scoped checkout server action, loaded on demand so the import only
 * resolves on cloud (where the plan step renders). Passed to the client plan
 * step as a form action; the form's hidden `interval` field carries the chosen
 * billing interval into the action's `FormData`.
 */
export async function getCheckoutAction(): Promise<(formData: FormData) => Promise<void>> {
    const billing =
        process.env.OSS_BUILD === "true" ? null : await import("@/lib/ee/billing-actions");
    if (!billing) throw new Error("Cloud billing is unavailable in self-host builds.");
    return billing.createCheckoutAction;
}
