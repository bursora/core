/**
 * Cloud entitlement check for the SDK budget path.
 *
 * `cloudWorkspaceUnentitled(workspaceId)` is true only when a cloud workspace
 * owner's subscription has lapsed out of the active set {active, past_due,
 * unpaid} AND the workspace is not admin-owned. It drives the graceful degrade:
 * a lapsed cloud workspace keeps ingesting but loses paid budget enforcement
 * (blocks lift to allow+notify). Self-host (`IS_CLOUD=false`) and admin-owned
 * workspaces are always entitled.
 *
 * Note: entitlement uses the workspace-owner axis (`isAdminOwnedWorkspace`),
 * NOT the session-admin check the view-paywall lock uses — the SDK ingest path
 * has no session.
 *
 * Fully injected (mirrors `cloud-workspace-locked.test.ts`): the suite sets the
 * `isCloud` flag, the admin-owned resolver, and a fake billing read directly,
 * so it exercises the truth table without an env or a real database.
 */

import { cloudWorkspaceUnentitled, setBillingGateDepsForTesting } from "@/lib/billing-gate/server";
import type { UserBillingRecord } from "@/lib/ee/billing/user-billing.repository";
import { afterEach, describe, expect, test } from "bun:test";

const WORKSPACE_ID = "11111111-2222-3333-4444-555555555555";
const OWNER_USER_ID = "99999999-8888-7777-6666-555555555555";

const record = (subscriptionStatus: string | null): UserBillingRecord => ({
    userId: OWNER_USER_ID,
    providerCustomerId: "cus_1",
    providerSubscriptionId: "sub_1",
    providerVariantId: null,
    subscriptionStatus,
    subscribedAt: new Date("2026-01-01T00:00:00.000Z"),
    refundEligibleUntil: null,
});

afterEach(() => {
    setBillingGateDepsForTesting(null);
});

describe("cloudWorkspaceUnentitled", () => {
    test("self-host is always entitled without reading billing", async () => {
        let reads = 0;
        setBillingGateDepsForTesting({
            isCloud: false,
            isAdminOwnedWorkspace: async () => false,
            readBilling: async () => {
                reads += 1;
                return null;
            },
        });

        expect(await cloudWorkspaceUnentitled(WORKSPACE_ID)).toBe(false);
        // Self-host must not touch the billing record at all.
        expect(reads).toBe(0);
    });

    test.each(["active", "past_due", "unpaid"])(
        "cloud with %s subscription is entitled",
        async (status) => {
            setBillingGateDepsForTesting({
                isCloud: true,
                isAdminOwnedWorkspace: async () => false,
                readBilling: async () => record(status),
            });
            expect(await cloudWorkspaceUnentitled(WORKSPACE_ID)).toBe(false);
        },
    );

    test.each(["canceled", "expired", "paused", null])(
        "cloud with %s subscription is unentitled",
        async (status) => {
            setBillingGateDepsForTesting({
                isCloud: true,
                isAdminOwnedWorkspace: async () => false,
                readBilling: async () => record(status),
            });
            expect(await cloudWorkspaceUnentitled(WORKSPACE_ID)).toBe(true);
        },
    );

    test("cloud with no billing record is unentitled", async () => {
        setBillingGateDepsForTesting({
            isCloud: true,
            isAdminOwnedWorkspace: async () => false,
            readBilling: async () => null,
        });
        expect(await cloudWorkspaceUnentitled(WORKSPACE_ID)).toBe(true);
    });

    test("billing read failure defaults to entitled (must not 500 the budget preflight)", async () => {
        setBillingGateDepsForTesting({
            isCloud: true,
            isAdminOwnedWorkspace: async () => false,
            readBilling: async () => {
                throw new Error("billing db down");
            },
        });
        // A transient billing-DB blip falls back to entitled so normal
        // enforcement keeps applying and the hot path never throws.
        expect(await cloudWorkspaceUnentitled(WORKSPACE_ID)).toBe(false);
    });

    test.each(["canceled", "expired", null])(
        "cloud admin-owned workspace is entitled with %s subscription without reading billing",
        async (status) => {
            let reads = 0;
            setBillingGateDepsForTesting({
                isCloud: true,
                isAdminOwnedWorkspace: async () => true,
                readBilling: async () => {
                    reads += 1;
                    return record(status);
                },
            });
            expect(await cloudWorkspaceUnentitled(WORKSPACE_ID)).toBe(false);
            // Admin-owned short-circuits before the billing read.
            expect(reads).toBe(0);
        },
    );
});
