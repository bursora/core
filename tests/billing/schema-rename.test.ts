/**
 * Pins the provider-neutral billing schema and types so a future refactor
 * cannot silently drift back to provider-specific names.
 *
 * Workspace billing columns expose provider-neutral names
 * (`provider_customer_id`, `provider_subscription_id`). The webhook
 * idempotency table is `billing_webhook_events`. The
 * `WorkspaceBillingRecord`, `WorkspaceBillingUpdate`, and lookup methods
 * follow the same neutral naming.
 */

import { schema } from "@/lib/db";
import type {
    BillingWebhookEventStore,
    WorkspaceBillingRecord,
    WorkspaceBillingRepository,
    WorkspaceBillingUpdate,
} from "@/lib/ee/billing";
import { describe, expect, test } from "bun:test";
import { getTableConfig } from "drizzle-orm/pg-core";

describe("billing schema rename", () => {
    test("workspaces table exposes provider-neutral columns", () => {
        const { columns } = getTableConfig(schema.workspaces);
        const names = columns.map((c) => c.name).sort();

        expect(names).toContain("provider_customer_id");
        expect(names).toContain("provider_subscription_id");
    });

    test("workspaces Drizzle object exposes provider-neutral JS field names", () => {
        // Accessing these properties at compile time + runtime locks the JS
        // names on the schema.workspaces object.
        const { providerCustomerId, providerSubscriptionId } = schema.workspaces;
        expect(providerCustomerId.name).toBe("provider_customer_id");
        expect(providerSubscriptionId.name).toBe("provider_subscription_id");
    });

    test("billing webhook idempotency table is named billing_webhook_events", () => {
        const { name } = getTableConfig(schema.billingWebhookEvents);
        expect(name).toBe("billing_webhook_events");
    });

    test("WorkspaceBillingRecord and Update carry the provider-neutral field names", () => {
        const record: WorkspaceBillingRecord = {
            workspaceId: "ws_1",
            providerCustomerId: "cus_1",
            providerSubscriptionId: "sub_1",
            subscriptionStatus: "active",
            subscribedAt: null,
            refundEligibleUntil: null,
        };
        expect(record.providerCustomerId).toBe("cus_1");
        expect(record.providerSubscriptionId).toBe("sub_1");

        const update: WorkspaceBillingUpdate = {
            workspaceId: "ws_1",
            providerCustomerId: "cus_2",
            providerSubscriptionId: "sub_2",
        };
        expect(update.providerCustomerId).toBe("cus_2");
        expect(update.providerSubscriptionId).toBe("sub_2");
    });

    test("repository lookup methods follow the provider-neutral naming", () => {
        // Compile-time check: the interface must expose this method name.
        type RequiredMethods = Pick<WorkspaceBillingRepository, "findByProviderCustomerId">;
        const _check = (repo: RequiredMethods): RequiredMethods => repo;
        expect(_check).toBeDefined();
    });

    test("BillingWebhookEventStore is the exported store type", () => {
        // Compile-time check that the public type is named `BillingWebhookEventStore`.
        const _check = (store: BillingWebhookEventStore): BillingWebhookEventStore => store;
        expect(_check).toBeDefined();
    });
});
