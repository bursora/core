/**
 * Pins the provider-neutral billing schema and types so a future refactor
 * cannot silently drift back to provider-specific names.
 *
 * Workspace billing columns expose provider-neutral names
 * (`provider_customer_id`, `provider_subscription_id`, `last_invoice_ref`).
 * The webhook idempotency table is `billing_webhook_events`. The
 * `WorkspaceBillingRecord`, `WorkspaceBillingUpdate`, and lookup methods
 * follow the same neutral naming.
 */

import { schema } from "@/lib/db";
import type { BillingWebhookEventStore } from "@/lib/ee/billing";
import type {
    WorkspaceBillingRecord,
    WorkspaceBillingRepository,
    WorkspaceBillingUpdate,
} from "@/lib/ee/billing";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, test } from "bun:test";

describe("billing schema rename", () => {
    test("workspaces table exposes provider-neutral columns", () => {
        const { columns } = getTableConfig(schema.workspaces);
        const names = columns.map((c) => c.name).sort();

        expect(names).toContain("provider_customer_id");
        expect(names).toContain("provider_subscription_id");
        expect(names).toContain("last_invoice_ref");
        expect(names).toContain("trial_ends_at");
    });

    test("workspaces Drizzle object exposes provider-neutral JS field names", () => {
        // Accessing these properties at compile time + runtime locks the JS
        // names on the schema.workspaces object.
        const { providerCustomerId, providerSubscriptionId, lastInvoiceRef } = schema.workspaces;
        expect(providerCustomerId.name).toBe("provider_customer_id");
        expect(providerSubscriptionId.name).toBe("provider_subscription_id");
        expect(lastInvoiceRef.name).toBe("last_invoice_ref");
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
            lastInvoiceRef: "in_1",
            lastBilledMonth: "2025-01",
            trialEndsAt: null,
        };
        expect(record.providerCustomerId).toBe("cus_1");
        expect(record.providerSubscriptionId).toBe("sub_1");
        expect(record.lastInvoiceRef).toBe("in_1");
        expect(record.trialEndsAt).toBeNull();

        const trialEnd = new Date("2025-03-15T00:00:00Z");
        const update: WorkspaceBillingUpdate = {
            workspaceId: "ws_1",
            providerCustomerId: "cus_2",
            providerSubscriptionId: "sub_2",
            lastInvoiceRef: "in_2",
            trialEndsAt: trialEnd,
        };
        expect(update.providerCustomerId).toBe("cus_2");
        expect(update.providerSubscriptionId).toBe("sub_2");
        expect(update.lastInvoiceRef).toBe("in_2");
        expect(update.trialEndsAt).toBe(trialEnd);
    });

    test("repository lookup methods follow the provider-neutral naming", () => {
        // Compile-time check: the interface must expose these method names.
        type RequiredMethods = Pick<
            WorkspaceBillingRepository,
            "findByProviderCustomerId" | "findByInvoiceRef"
        >;
        const _check = (repo: RequiredMethods): RequiredMethods => repo;
        expect(_check).toBeDefined();
    });

    test("BillingWebhookEventStore is the exported store type", () => {
        // Compile-time check that the public type is named `BillingWebhookEventStore`.
        const _check = (store: BillingWebhookEventStore): BillingWebhookEventStore => store;
        expect(_check).toBeDefined();
    });
});
