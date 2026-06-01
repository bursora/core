/**
 * DB-backed contract tests for the REAL `DrizzleUserBillingRepository`.
 *
 * Runs the production repo against an in-memory PGlite Postgres with all
 * migrations applied, so the `user_subscriptions_provider_customer_idx` UNIQUE
 * index executes for real. The in-memory twin in
 * `user-billing-repository.test.ts` mirrors this behavior contract.
 *
 * Regression: a provider customer id is unique to one user. When a second user
 * claims a customer id another row already holds (account deletion +
 * re-subscribe, or a fresh user re-running checkout against the same provider
 * customer in testing), the upsert used to trip the unique index and the
 * activation webhook 500'd forever, stranding onboarding on its polling spinner.
 * The upsert now detaches the id from the prior row inside the same
 * transaction, so the newest claimant wins and the write succeeds.
 */

import { schema } from "@/lib/db";
import { DrizzleUserBillingRepository } from "@/lib/ee/billing/drizzle-user-billing.repository";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createTestDb, truncateAll, type TestDbHandle } from "../support/pglite-db";

const USER_A = "11111111-2222-3333-4444-555555555555";
const USER_B = "99999999-8888-7777-6666-555555555555";

let handle: TestDbHandle;

const repo = () => new DrizzleUserBillingRepository(handle.db);

beforeAll(async () => {
    handle = await createTestDb();
});

afterAll(async () => {
    await handle.close();
});

beforeEach(async () => {
    await truncateAll(handle.pg);
    await handle.db.insert(schema.users).values([
        { id: USER_A, name: "User A", email: "a@example.com" },
        { id: USER_B, name: "User B", email: "b@example.com" },
    ]);
});

describe("DrizzleUserBillingRepository", () => {
    test("upsert inserts then reverse-resolves by provider customer id", async () => {
        await repo().upsert({
            userId: USER_A,
            providerCustomerId: "cus_1",
            providerSubscriptionId: "sub_1",
            subscriptionStatus: "active",
        });

        expect((await repo().findByUserId(USER_A))?.subscriptionStatus).toBe("active");
        expect((await repo().findByProviderCustomerId("cus_1"))?.userId).toBe(USER_A);
    });

    test("claiming a customer id held by another user transfers it instead of 500ing", async () => {
        await repo().upsert({
            userId: USER_A,
            providerCustomerId: "cus_shared",
            providerSubscriptionId: "sub_old",
            subscriptionStatus: "active",
        });

        // A fresh user re-runs checkout against the same provider customer. This
        // is the exact write that previously violated the unique index.
        await repo().upsert({
            userId: USER_B,
            providerCustomerId: "cus_shared",
            providerSubscriptionId: "sub_new",
            subscriptionStatus: "active",
        });

        expect((await repo().findByProviderCustomerId("cus_shared"))?.userId).toBe(USER_B);
        expect((await repo().findByUserId(USER_B))?.subscriptionStatus).toBe("active");
        // The stale row keeps its other fields but stops resolving by customer id.
        const stale = await repo().findByUserId(USER_A);
        expect(stale?.providerCustomerId).toBeNull();
        expect(stale?.subscriptionStatus).toBe("active");
    });

    test("re-claiming the same id under the same user is a plain update", async () => {
        await repo().upsert({
            userId: USER_A,
            providerCustomerId: "cus_1",
            subscriptionStatus: "active",
        });
        await repo().upsert({
            userId: USER_A,
            providerCustomerId: "cus_1",
            subscriptionStatus: "past_due",
        });

        expect((await repo().findByUserId(USER_A))?.subscriptionStatus).toBe("past_due");
        expect((await repo().findByProviderCustomerId("cus_1"))?.userId).toBe(USER_A);
    });
});
