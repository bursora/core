/**
 * Cloud view-paywall lock check.
 *
 * `cloudWorkspaceLocked(workspaceId)` is the single gate every cloud surface
 * asks before rendering real data. Lock truth table:
 *   - Self-host (`IS_CLOUD=false`) is always unlocked. This path never imports
 *     `lib/ee`, so the OSS build keeps excluding the billing module.
 *   - Cloud reads the workspace billing record and locks unless the
 *     subscription is in the active set (see `lib/billing-status`).
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
import { env } from "@/lib/env";
import type { WorkspaceBillingRecord } from "@/lib/ee/billing/workspace-billing.repository";

export interface BillingGateDeps {
    readonly isCloud: boolean;
    /** Reads the workspace billing record. Only called on the cloud path. */
    readonly readBilling: (workspaceId: string) => Promise<WorkspaceBillingRecord | null>;
    /**
     * True when the current session user is a platform admin. Optional: when
     * absent the gate treats the user as a non-admin. Production wiring reads
     * the session role; tests omit it (non-admin) or inject a fake.
     */
    readonly isCurrentUserAdmin?: () => Promise<boolean>;
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
            return session?.user?.role === "admin";
        },
        readBilling: async (workspaceId) => {
            // Unreachable in the OSS build: that bundle is self-host, so
            // `isCloud` is false and this read is never called.
            if (eeBillingPromise === null) return null;
            const { getWorkspaceBillingRecord } = await eeBillingPromise;
            return getWorkspaceBillingRecord(workspaceId);
        },
    };
}

/**
 * True when a cloud workspace should see the view-paywall instead of real
 * data. Always `false` on self-host. On cloud, `true` unless the workspace has
 * an active subscription. The billing read is deduped per request by
 * `getWorkspaceBillingRecord`'s own `cache()`, so the layout, the page it
 * renders, and `BillingSection` on settings share one query.
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
