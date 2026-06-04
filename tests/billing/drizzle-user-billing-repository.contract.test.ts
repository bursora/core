/**
 * DB-backed contract tests for the REAL `DrizzleUserBillingRepository`.
 *
 * Runs the production repo against an in-memory PGlite Postgres with all
 * migrations applied, so the `user_subscriptions_provider_subscription_idx`
 * UNIQUE index executes for real. The in-memory twin in
 * `user-billing-repository.test.ts` mirrors this behavior contract.
 *
 * A provider subscription id is unique to one user; a provider customer id is
 * not (one billing customer can back several accounts the same person owns).
 * When a second user claims a subscription id another row already holds, the
 * upsert detaches it from the prior row inside the same transaction so the
 * write never trips the unique index and 500s the activation webhook. Customer
 * ids are shared, never detached.
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
    test("upsert inserts then reverse-resolves by provider subscription id", async () => {
        await repo().upsert({
            userId: USER_A,
            providerCustomerId: "cus_1",
            providerSubscriptionId: "sub_1",
            subscriptionStatus: "active",
        });

        expect((await repo().findByUserId(USER_A))?.subscriptionStatus).toBe("active");
        expect((await repo().findByProviderSubscriptionId("sub_1"))?.userId).toBe(USER_A);
        expect((await repo().findByProviderCustomerId("cus_1"))?.userId).toBe(USER_A);
    });

    test("two accounts share one billing customer without detaching it", async () => {
        // One person, two accounts, one LS customer; distinct subscriptions. The
        // shared customer id must survive on both rows (this is the write that
        // used to null the older row under the old unique-customer index).
        await repo().upsert({
            userId: USER_A,
            providerCustomerId: "cus_shared",
            providerSubscriptionId: "sub_a",
            subscriptionStatus: "active",
        });
        await repo().upsert({
            userId: USER_B,
            providerCustomerId: "cus_shared",
            providerSubscriptionId: "sub_b",
            subscriptionStatus: "active",
        });

        expect((await repo().findByUserId(USER_A))?.providerCustomerId).toBe("cus_shared");
        expect((await repo().findByUserId(USER_B))?.providerCustomerId).toBe("cus_shared");
        expect((await repo().findByProviderSubscriptionId("sub_a"))?.userId).toBe(USER_A);
        expect((await repo().findByProviderSubscriptionId("sub_b"))?.userId).toBe(USER_B);
    });

    test("claiming a subscription id held by another user transfers it instead of 500ing", async () => {
        await repo().upsert({
            userId: USER_A,
            providerSubscriptionId: "sub_shared",
            subscriptionStatus: "active",
        });

        // The write that would otherwise violate the unique subscription index.
        await repo().upsert({
            userId: USER_B,
            providerSubscriptionId: "sub_shared",
            subscriptionStatus: "active",
        });

        expect((await repo().findByProviderSubscriptionId("sub_shared"))?.userId).toBe(USER_B);
        expect((await repo().findByUserId(USER_B))?.subscriptionStatus).toBe("active");
        // The stale row keeps its other fields but stops resolving by sub id.
        const stale = await repo().findByUserId(USER_A);
        expect(stale?.providerSubscriptionId).toBeNull();
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
