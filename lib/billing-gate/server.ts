/**
 * Cloud view-paywall lock check.
 *
 * `cloudWorkspaceLocked(workspaceId)` is the single gate every cloud surface
 * asks before rendering real data. Lock truth table:
 *   - Self-host (`IS_CLOUD=false`) is always unlocked. This path never imports
 *     `lib/ee`, so the OSS build keeps excluding the billing module.
 *   - Cloud reads the workspace owner's subscription and locks unless it is in
 *     the active set (see `lib/billing-status`). The owner is the account that
 *     pays; their subscription gates every workspace they own.
 *
 * The EE billing read is reached through a DYNAMIC import guarded by
 * `OSS_BUILD` — the sanctioned pattern that keeps `@/lib/ee` symbols out of
 * the OSS bundle (mirrors the Lemon Squeezy route). `IS_CLOUD` decides whether
 * the read runs at all; `OSS_BUILD` decides whether the import is even present
 * in the bundle. Routes and pages call `cloudWorkspaceLocked`; tests inject a
 * fake via `setBillingGateDepsForTesting`.
 */

import "server-only";

import { getRequestSession } from "@/lib/auth";
import { isActiveSubscriptionStatus } from "@/lib/billing-status";
import type { UserBillingRecord } from "@/lib/ee/billing/user-billing.repository";
import { env } from "@/lib/env";
import { errMessage } from "@/lib/error-message";
import { isAdminOwnedWorkspace } from "@/lib/identity/server";
import { USER_ROLE } from "@/lib/identity/user-role";

export interface BillingGateDeps {
    readonly isCloud: boolean;
    /**
     * Reads the workspace owner's billing record. Only called on the cloud
     * path.
     */
    readonly readBilling: (workspaceId: string) => Promise<UserBillingRecord | null>;
    /**
     * True when the current session user is a platform admin. Optional: when
     * absent the gate treats the user as a non-admin. Production wiring reads
     * the session role; tests omit it (non-admin) or inject a fake.
     */
    readonly isCurrentUserAdmin?: () => Promise<boolean>;
    /**
     * True when the workspace owner is a platform admin (operator dogfood
     * tenant). The entitlement check uses this owner axis — not the
     * session-admin check above — because the SDK ingest path has no session.
     * Optional: production falls back to the real resolver; tests inject a fake.
     */
    readonly isAdminOwnedWorkspace?: (workspaceId: string) => Promise<boolean>;
}

let testOverride: BillingGateDeps | null = null;

/** Test-only: inject a fake gate. Pass `null` to revert to production wiring. */
export function setBillingGateDepsForTesting(deps: BillingGateDeps | null): void {
    testOverride = deps;
}

// Guard the dynamic EE import behind OSS_BUILD (set in next.config.ts) the same
// way the Lemon Squeezy route does: in the OSS build the import is statically
// unreachable, so the bundler drops the `lib/ee/billing` chunk entirely. On a
// cloud runtime OSS_BUILD is "false", so the EE billing read loads on demand.
const eeBillingPromise =
    process.env.OSS_BUILD === "true" ? null : import("@/lib/ee/billing/server");

function billingGateDeps(): BillingGateDeps {
    if (testOverride !== null) return testOverride;
    return {
        isCloud: env().IS_CLOUD,
        isCurrentUserAdmin: async () => {
            const session = await getRequestSession();
            return session?.user?.role === USER_ROLE.admin;
        },
        isAdminOwnedWorkspace,
        readBilling: async (workspaceId) => {
            // Unreachable in the OSS build: that bundle is self-host, so
            // `isCloud` is false and this read is never called.
            if (eeBillingPromise === null) return null;
            const { getWorkspaceOwnerBillingRecord } = await eeBillingPromise;
            return getWorkspaceOwnerBillingRecord(workspaceId);
        },
    };
}

/**
 * True when a cloud workspace should see the view-paywall instead of real
 * data. Always `false` on self-host. On cloud, `true` unless the workspace
 * owner has an active subscription. The billing read is deduped per request by
 * `getUserBillingRecord`'s own `cache()`, so the layout and the page it renders
 * share one query.
 */
export async function cloudWorkspaceLocked(workspaceId: string): Promise<boolean> {
    const deps = billingGateDeps();
    if (!deps.isCloud) return false;
    // Platform admins never see the paywall: their own dogfood workspaces stay
    // open regardless of subscription. Checked before the billing read so an
    // admin skips it entirely.
    if (await deps.isCurrentUserAdmin?.()) return false;
    const record = await deps.readBilling(workspaceId);
    return !isActiveSubscriptionStatus(record?.subscriptionStatus);
}

/**
 * True when a cloud workspace has lost paid budget enforcement because its
 * owner's subscription lapsed out of the active set. Drives the SDK graceful
 * degrade: ingest stays up, but a `block` budget decision is returned as an
 * allow (SDK `notify` mode); no budget-crossing alert is dispatched.
 *
 * Always `false` off cloud (self-host has no subscription) and for admin-owned
 * dogfood tenants. Uses the workspace-owner admin axis, not the session-admin
 * check `cloudWorkspaceLocked` uses, because the SDK ingest path has no
 * session. The admin check runs before the billing read so a dogfood tenant
 * skips it entirely.
 *
 * A billing-read failure defaults to entitled (`false`): this read sits on the
 * hot `/api/v1/budget` preflight, and a transient billing-DB blip must not 500
 * the endpoint or silently disable enforcement — normal budgets keep applying.
 */
export async function cloudWorkspaceUnentitled(workspaceId: string): Promise<boolean> {
    const deps = billingGateDeps();
    if (!deps.isCloud) return false;
    if (await (deps.isAdminOwnedWorkspace ?? isAdminOwnedWorkspace)(workspaceId)) return false;
    let record: UserBillingRecord | null;
    try {
        record = await deps.readBilling(workspaceId);
    } catch (err) {
        console.warn("billing_gate.entitlement_read_failed", {
            workspaceId,
            err: errMessage(err),
        });
        return false;
    }
    return !isActiveSubscriptionStatus(record?.subscriptionStatus);
}
