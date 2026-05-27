/**
 * Billing feature integration test.
 *
 * Drives the public API exposed by `@/lib/billing` — the surface `app/`
 * and other features depend on. Uses in-memory fakes for the payment
 * provider + the workspace-billing repository (identical pattern to the
 * deeper tests in `tests/billing/`); the goal here is to lock the feature
 * folder's public contract: schema re-exports, checkout/portal/webhook use
 * cases, subscription transitions, and the idempotency of webhook replays.
 */

import {
    createCheckoutSessionUseCase,
    getBillingPortalUrlUseCase,
    handleWebhookUseCase,
    workspaces as workspacesTable,
    type WebhookEvent,
    type WorkspaceBillingRepository,
} from "@/lib/ee/billing";
import { FakePaymentProviderAdapter } from "@/tests/billing/fakes/fake-payment-provider.adapter";
import { InMemoryBillingWebhookEventStore } from "@/tests/billing/fakes/in-memory-billing-webhook-event.store";
import { InMemoryWorkspaceBillingRepository } from "@/tests/billing/fakes/in-memory-workspace-billing.repository";
import { describe, expect, test } from "bun:test";

const WORKSPACE_ID = "11111111-2222-3333-4444-555555555555";

const seedUnsubscribed = (workspaces: InMemoryWorkspaceBillingRepository): void => {
    workspaces.seed({
        workspaceId: WORKSPACE_ID,
        providerCustomerId: null,
        providerSubscriptionId: null,
        subscriptionStatus: null,
    });
};

const seedActive = (workspaces: InMemoryWorkspaceBillingRepository): void => {
    workspaces.seed({
        workspaceId: WORKSPACE_ID,
        providerCustomerId: "cus_42",
        providerSubscriptionId: "sub_42",
        subscriptionStatus: "active",
    });
};

const dispatch = async (
    event: WebhookEvent,
    workspaces: WorkspaceBillingRepository,
    webhookEvents: InMemoryBillingWebhookEventStore = new InMemoryBillingWebhookEventStore(),
): Promise<void> => {
    const provider = new FakePaymentProviderAdapter();
    provider.nextEvent = event;
    const result = await handleWebhookUseCase({
        rawBody: "{}",
        signatureHeader: "sig",
        provider,
        workspaces,
        webhookEvents,
    });
    expect(result.verified).toBe(true);
};

describe("@/lib/billing public API", () => {
    test("schema tables are re-exported", () => {
        expect(workspacesTable).toBeDefined();
    });

    test("createCheckoutSessionUseCase delegates to the provider adapter", async () => {
        const provider = new FakePaymentProviderAdapter();
        provider.nextCheckoutResult = {
            id: "cs_x",
            url: "https://provider.test/checkout/cs_x",
        };
        const result = await createCheckoutSessionUseCase({
            workspaceId: WORKSPACE_ID,
            userEmail: "owner@example.com",
            variantId: "variant_team",
            successUrl: "https://app.test/ok",
            cancelUrl: "https://app.test/cancel",
            provider,
        });
        expect(result.url).toBe("https://provider.test/checkout/cs_x");
        expect(provider.checkoutCalls).toHaveLength(1);
        expect(provider.checkoutCalls[0]?.variantId).toBe("variant_team");
    });

    test("getBillingPortalUrlUseCase opens the portal for the workspace's provider customer", async () => {
        const provider = new FakePaymentProviderAdapter();
        provider.nextPortalResult = { url: "https://provider.test/portal/p1" };
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedActive(workspaces);

        const result = await getBillingPortalUrlUseCase({
            workspaceId: WORKSPACE_ID,
            returnUrl: "https://app.test/return",
            workspaces,
            provider,
        });
        expect(result.url).toBe("https://provider.test/portal/p1");
        expect(provider.portalCalls[0]?.customerId).toBe("cus_42");
    });

    test("webhook with invalid signature reports unverified", async () => {
        const provider = new FakePaymentProviderAdapter();
        provider.verifyShouldThrow = true;
        const workspaces = new InMemoryWorkspaceBillingRepository();
        const result = await handleWebhookUseCase({
            rawBody: "{}",
            signatureHeader: "bad",
            provider,
            workspaces,
            webhookEvents: new InMemoryBillingWebhookEventStore(),
        });
        expect(result.verified).toBe(false);
    });

    test("subscription.activated records active subscription and stores provider ids", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedUnsubscribed(workspaces);
        await dispatch(
            {
                id: "evt_feat_checkout",
                type: "subscription.activated",
                workspaceId: WORKSPACE_ID,
                customerId: "cus_new",
                subscriptionId: "sub_new",
            },
            workspaces,
        );
        const after = await workspaces.findById(WORKSPACE_ID);
        expect(after?.subscriptionStatus).toBe("active");
        expect(after?.providerCustomerId).toBe("cus_new");
        expect(after?.providerSubscriptionId).toBe("sub_new");
    });

    test("subscription.canceled records subscription_status='canceled'", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedActive(workspaces);
        await dispatch(
            {
                id: "evt_feat_deleted",
                type: "subscription.canceled",
                customerId: "cus_42",
            },
            workspaces,
        );
        const after = await workspaces.findById(WORKSPACE_ID);
        expect(after?.subscriptionStatus).toBe("canceled");
    });

    test("webhook replays are idempotent (same event applied twice yields same state)", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedUnsubscribed(workspaces);
        const event: WebhookEvent = {
            id: "evt_feat_replay",
            type: "subscription.activated",
            workspaceId: WORKSPACE_ID,
            customerId: "cus_new",
            subscriptionId: "sub_new",
        };
        await dispatch(event, workspaces);
        await dispatch(event, workspaces);
        const after = await workspaces.findById(WORKSPACE_ID);
        expect(after?.subscriptionStatus).toBe("active");
        expect(after?.providerCustomerId).toBe("cus_new");
        expect(after?.providerSubscriptionId).toBe("sub_new");
    });
});
