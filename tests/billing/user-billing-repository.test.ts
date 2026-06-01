/**
 * Contract tests for the user-scoped billing repository.
 *
 * The billing record is keyed by `userId` (the account that pays), upserted
 * because no row pre-exists until Checkout activates, and reverse-resolvable
 * from the provider customer id. The in-memory fake is the contract surface;
 * `DrizzleUserBillingRepository` mirrors it against the `user_subscriptions`
 * table.
 */

import type { UserBillingRecord } from "@/lib/ee/billing/user-billing.repository";
import { describe, expect, test } from "bun:test";
import { InMemoryUserBillingRepository } from "./fakes/in-memory-user-billing.repository";

const USER_ID = "11111111-2222-3333-4444-555555555555";
const OTHER_USER_ID = "99999999-8888-7777-6666-555555555555";

describe("UserBillingRepository", () => {
    test("upsert inserts a new record keyed by userId", async () => {
        const repo = new InMemoryUserBillingRepository();
        const subscribedAt = new Date("2026-01-01T00:00:00Z");

        await repo.upsert({
            userId: USER_ID,
            providerCustomerId: "cus_1",
            providerSubscriptionId: "sub_1",
            subscriptionStatus: "active",
            subscribedAt,
        });

        const record = await repo.findByUserId(USER_ID);
        expect(record).toEqual({
            userId: USER_ID,
            providerCustomerId: "cus_1",
            providerSubscriptionId: "sub_1",
            subscriptionStatus: "active",
            subscribedAt,
            refundEligibleUntil: null,
        } satisfies UserBillingRecord);
    });

    test("upsert merges partial fields without clobbering unset ones", async () => {
        const repo = new InMemoryUserBillingRepository();
        await repo.upsert({
            userId: USER_ID,
            providerCustomerId: "cus_1",
            providerSubscriptionId: "sub_1",
            subscriptionStatus: "active",
        });

        await repo.upsert({ userId: USER_ID, subscriptionStatus: "past_due" });

        const record = await repo.findByUserId(USER_ID);
        expect(record?.subscriptionStatus).toBe("past_due");
        expect(record?.providerCustomerId).toBe("cus_1");
        expect(record?.providerSubscriptionId).toBe("sub_1");
    });

    test("findByUserId returns null for an unknown user", async () => {
        const repo = new InMemoryUserBillingRepository();
        expect(await repo.findByUserId(USER_ID)).toBeNull();
    });

    test("findByProviderCustomerId reverse-resolves the owning user", async () => {
        const repo = new InMemoryUserBillingRepository();
        await repo.upsert({ userId: OTHER_USER_ID, providerCustomerId: "cus_other" });
        await repo.upsert({ userId: USER_ID, providerCustomerId: "cus_target" });

        const record = await repo.findByProviderCustomerId("cus_target");
        expect(record?.userId).toBe(USER_ID);
    });

    test("findByProviderCustomerId returns null when no row matches", async () => {
        const repo = new InMemoryUserBillingRepository();
        await repo.upsert({ userId: USER_ID, providerCustomerId: "cus_1" });
        expect(await repo.findByProviderCustomerId("cus_absent")).toBeNull();
    });

    test("claiming a customer id held by another user transfers it instead of failing", async () => {
        const repo = new InMemoryUserBillingRepository();
        await repo.upsert({
            userId: OTHER_USER_ID,
            providerCustomerId: "cus_shared",
            subscriptionStatus: "active",
        });

        // A fresh user re-runs checkout against the same provider customer.
        await repo.upsert({
            userId: USER_ID,
            providerCustomerId: "cus_shared",
            subscriptionStatus: "active",
        });

        // The id now resolves only to the new claimant; the stale row is detached.
        expect((await repo.findByProviderCustomerId("cus_shared"))?.userId).toBe(USER_ID);
        expect((await repo.findByUserId(USER_ID))?.providerCustomerId).toBe("cus_shared");
        expect((await repo.findByUserId(OTHER_USER_ID))?.providerCustomerId).toBeNull();
    });
});
