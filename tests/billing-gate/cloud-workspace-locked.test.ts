/**
 * Cloud view-paywall lock check.
 *
 * `cloudWorkspaceLocked(workspaceId)` is the single gate every cloud surface
 * asks before rendering real data. It encodes the lock truth table:
 *   - Self-host (`IS_CLOUD=false`) is always unlocked. That branch never reads
 *     billing, so the OSS build keeps excluding `lib/ee`.
 *   - Cloud reads the workspace owner's subscription and locks unless it is in
 *     the active set {active, past_due, unpaid}.
 *
 * The check is fully injected (mirrors `event-bundle/server.ts`) so this suite
 * exercises the truth table without an env or a real database: it sets the
 * `isCloud` flag and a fake billing read directly.
 */

import { cloudWorkspaceLocked, setBillingGateDepsForTesting } from "@/lib/billing-gate/server";
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

describe("cloudWorkspaceLocked", () => {
    test("self-host is always unlocked without reading billing", async () => {
        let reads = 0;
        setBillingGateDepsForTesting({
            isCloud: false,
            readBilling: async () => {
                reads += 1;
                return null;
            },
        });

        expect(await cloudWorkspaceLocked(WORKSPACE_ID)).toBe(false);
        // Self-host must not touch the billing record at all.
        expect(reads).toBe(0);
    });

    test("cloud with no billing record is locked", async () => {
        setBillingGateDepsForTesting({ isCloud: true, readBilling: async () => null });
        expect(await cloudWorkspaceLocked(WORKSPACE_ID)).toBe(true);
    });

    test.each(["active", "past_due", "unpaid"])(
        "cloud with %s subscription is unlocked",
        async (status) => {
            setBillingGateDepsForTesting({
                isCloud: true,
                readBilling: async () => record(status),
            });
            expect(await cloudWorkspaceLocked(WORKSPACE_ID)).toBe(false);
        },
    );

    test.each(["canceled", "cancelled", "expired", "paused", null])(
        "cloud with %s subscription is locked",
        async (status) => {
            setBillingGateDepsForTesting({
                isCloud: true,
                readBilling: async () => record(status),
            });
            expect(await cloudWorkspaceLocked(WORKSPACE_ID)).toBe(true);
        },
    );
});

describe("cloudWorkspaceLocked — platform admin bypass", () => {
    test.each(["canceled", "expired", "paused", null])(
        "cloud admin session is unlocked with %s subscription without reading billing",
        async (status) => {
            let reads = 0;
            setBillingGateDepsForTesting({
                isCloud: true,
                isCurrentUserAdmin: async () => true,
                readBilling: async () => {
                    reads += 1;
                    return record(status);
                },
            });
            expect(await cloudWorkspaceLocked(WORKSPACE_ID)).toBe(false);
            // Admin short-circuits before the billing read.
            expect(reads).toBe(0);
        },
    );

    test("cloud non-admin with inactive subscription stays locked", async () => {
        setBillingGateDepsForTesting({
            isCloud: true,
            isCurrentUserAdmin: async () => false,
            readBilling: async () => record(null),
        });
        expect(await cloudWorkspaceLocked(WORKSPACE_ID)).toBe(true);
    });
});

describe("cloudWorkspaceLocked — beta owner bypass", () => {
    test.each(["canceled", "expired", "paused", null])(
        "cloud beta-owned workspace is unlocked with %s subscription without reading billing",
        async (status) => {
            let reads = 0;
            setBillingGateDepsForTesting({
                isCloud: true,
                isCurrentUserAdmin: async () => false,
                isBetaOwnedWorkspace: async () => true,
                readBilling: async () => {
                    reads += 1;
                    return record(status);
                },
            });
            expect(await cloudWorkspaceLocked(WORKSPACE_ID)).toBe(false);
            // Beta short-circuits before the billing read, like admin does.
            expect(reads).toBe(0);
        },
    );

    test("cloud non-beta owner with no subscription stays locked", async () => {
        setBillingGateDepsForTesting({
            isCloud: true,
            isCurrentUserAdmin: async () => false,
            isBetaOwnedWorkspace: async () => false,
            readBilling: async () => null,
        });
        expect(await cloudWorkspaceLocked(WORKSPACE_ID)).toBe(true);
    });
});
