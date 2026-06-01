/**
 * Pins the provider-neutral billing schema and types so a future refactor
 * cannot silently drift back to provider-specific names.
 *
 * Billing state lives on the user-scoped `user_subscriptions` table with
 * provider-neutral columns (`provider_customer_id`,
 * `provider_subscription_id`). The webhook idempotency table is
 * `billing_webhook_events`. The `UserBillingRecord`, `UserBillingUpsert`, and
 * lookup methods follow the same neutral naming.
 */

import { schema } from "@/lib/db";
import type {
    BillingWebhookEventStore,
    UserBillingRecord,
    UserBillingRepository,
    UserBillingUpsert,
} from "@/lib/ee/billing";
import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";

describe("billing schema rename", () => {
    test("user_subscriptions table exposes provider-neutral columns keyed by user", () => {
        const { columns } = getTableConfig(schema.userSubscriptions);
        const names = columns.map((c) => c.name).sort();

        expect(names).toContain("user_id");
        expect(names).toContain("provider_customer_id");
        expect(names).toContain("provider_subscription_id");
    });

    test("billing columns no longer live on the workspaces table", () => {
        const { columns } = getTableConfig(schema.workspaces);
        const names = columns.map((c) => c.name);

        expect(names).not.toContain("provider_customer_id");
        expect(names).not.toContain("subscription_status");
    });

    test("user_subscriptions Drizzle object exposes provider-neutral JS field names", () => {
        const { providerCustomerId, providerSubscriptionId } = schema.userSubscriptions;
        expect(providerCustomerId.name).toBe("provider_customer_id");
        expect(providerSubscriptionId.name).toBe("provider_subscription_id");
    });

    test("billing webhook idempotency table is named billing_webhook_events", () => {
        const { name } = getTableConfig(schema.billingWebhookEvents);
        expect(name).toBe("billing_webhook_events");
    });

    test("UserBillingRecord and Upsert carry the provider-neutral field names", () => {
        const record: UserBillingRecord = {
            userId: "user_1",
            providerCustomerId: "cus_1",
            providerSubscriptionId: "sub_1",
            subscriptionStatus: "active",
            subscribedAt: null,
            refundEligibleUntil: null,
        };
        expect(record.providerCustomerId).toBe("cus_1");
        expect(record.providerSubscriptionId).toBe("sub_1");

        const update: UserBillingUpsert = {
            userId: "user_1",
            providerCustomerId: "cus_2",
            providerSubscriptionId: "sub_2",
        };
        expect(update.providerCustomerId).toBe("cus_2");
        expect(update.providerSubscriptionId).toBe("sub_2");
    });

    test("repository lookup methods follow the provider-neutral naming", () => {
        // Compile-time check: the interface must expose this method name.
        type RequiredMethods = Pick<UserBillingRepository, "findByProviderCustomerId">;
        const _check = (repo: RequiredMethods): RequiredMethods => repo;
        expect(_check).toBeDefined();
    });

    test("BillingWebhookEventStore is the exported store type", () => {
        // Compile-time check that the public type is named `BillingWebhookEventStore`.
        const _check = (store: BillingWebhookEventStore): BillingWebhookEventStore => store;
        expect(_check).toBeDefined();
    });
});
