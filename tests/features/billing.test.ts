/**
 * Billing feature integration test.
 *
 * Drives the public API exposed by `@/lib/billing` — the surface `app/`
 * and other features depend on. Uses in-memory fakes for Stripe + the
 * workspace-billing repository (identical pattern to the deeper tests in
 * `tests/billing/`); the goal here is to lock the feature folder's public
 * contract: schema re-exports, checkout/portal/webhook use cases,
 * subscription transitions, and the idempotency of webhook replays.
 */

import {
    createCheckoutSessionUseCase,
    getBillingPortalUrlUseCase,
    handleStripeWebhookUseCase,
    workspaces as workspacesTable,
    type StripeWebhookEvent,
    type WorkspaceBillingRepository,
} from "@/lib/ee/billing";
import { FakeStripeAdapter } from "@/tests/billing/fakes/fake-stripe.adapter";
import { InMemoryStripeWebhookEventStore } from "@/tests/billing/fakes/in-memory-stripe-webhook-event.store";
import { InMemoryWorkspaceBillingRepository } from "@/tests/billing/fakes/in-memory-workspace-billing.repository";
import { describe, expect, test } from "bun:test";

const WORKSPACE_ID = "11111111-2222-3333-4444-555555555555";

const seedUnsubscribed = (workspaces: InMemoryWorkspaceBillingRepository): void => {
    workspaces.seed({
        workspaceId: WORKSPACE_ID,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: null,
    });
};

const seedActive = (workspaces: InMemoryWorkspaceBillingRepository): void => {
    workspaces.seed({
        workspaceId: WORKSPACE_ID,
        stripeCustomerId: "cus_42",
        stripeSubscriptionId: "sub_42",
        subscriptionStatus: "active",
    });
};

const dispatch = async (
    event: StripeWebhookEvent,
    workspaces: WorkspaceBillingRepository,
    webhookEvents: InMemoryStripeWebhookEventStore = new InMemoryStripeWebhookEventStore(),
): Promise<void> => {
    const stripe = new FakeStripeAdapter();
    stripe.nextEvent = event;
    const result = await handleStripeWebhookUseCase({
        rawBody: "{}",
        signatureHeader: "sig",
        stripe,
        workspaces,
        webhookEvents,
    });
    expect(result.verified).toBe(true);
};

describe("@/lib/billing public API", () => {
    test("schema tables are re-exported", () => {
        expect(workspacesTable).toBeDefined();
    });

    test("createCheckoutSessionUseCase delegates to the Stripe adapter", async () => {
        const stripe = new FakeStripeAdapter();
        stripe.nextCheckoutResult = {
            id: "cs_x",
            url: "https://stripe.test/checkout/cs_x",
        };
        const result = await createCheckoutSessionUseCase({
            workspaceId: WORKSPACE_ID,
            userEmail: "owner@example.com",
            priceId: "price_team",
            successUrl: "https://app.test/ok",
            cancelUrl: "https://app.test/cancel",
            stripe,
        });
        expect(result.url).toBe("https://stripe.test/checkout/cs_x");
        expect(stripe.checkoutCalls).toHaveLength(1);
        expect(stripe.checkoutCalls[0]?.priceId).toBe("price_team");
    });

    test("getBillingPortalUrlUseCase opens the portal for the workspace's Stripe customer", async () => {
        const stripe = new FakeStripeAdapter();
        stripe.nextPortalResult = { url: "https://stripe.test/portal/p1" };
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedActive(workspaces);

        const result = await getBillingPortalUrlUseCase({
            workspaceId: WORKSPACE_ID,
            returnUrl: "https://app.test/return",
            workspaces,
            stripe,
        });
        expect(result.url).toBe("https://stripe.test/portal/p1");
        expect(stripe.portalCalls[0]?.customerId).toBe("cus_42");
    });

    test("webhook with invalid signature reports unverified", async () => {
        const stripe = new FakeStripeAdapter();
        stripe.verifyShouldThrow = true;
        const workspaces = new InMemoryWorkspaceBillingRepository();
        const result = await handleStripeWebhookUseCase({
            rawBody: "{}",
            signatureHeader: "bad",
            stripe,
            workspaces,
            webhookEvents: new InMemoryStripeWebhookEventStore(),
        });
        expect(result.verified).toBe(false);
    });

    test("checkout.session.completed records active subscription and stores Stripe ids", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedUnsubscribed(workspaces);
        await dispatch(
            {
                id: "evt_feat_checkout",
                type: "checkout.session.completed",
                workspaceId: WORKSPACE_ID,
                customerId: "cus_new",
                subscriptionId: "sub_new",
            },
            workspaces,
        );
        const after = await workspaces.findById(WORKSPACE_ID);
        expect(after?.subscriptionStatus).toBe("active");
        expect(after?.stripeCustomerId).toBe("cus_new");
        expect(after?.stripeSubscriptionId).toBe("sub_new");
    });

    test("customer.subscription.deleted records subscription_status='canceled'", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedActive(workspaces);
        await dispatch(
            {
                id: "evt_feat_deleted",
                type: "customer.subscription.deleted",
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
        const event: StripeWebhookEvent = {
            id: "evt_feat_replay",
            type: "checkout.session.completed",
            workspaceId: WORKSPACE_ID,
            customerId: "cus_new",
            subscriptionId: "sub_new",
        };
        await dispatch(event, workspaces);
        await dispatch(event, workspaces);
        const after = await workspaces.findById(WORKSPACE_ID);
        expect(after?.subscriptionStatus).toBe("active");
        expect(after?.stripeCustomerId).toBe("cus_new");
        expect(after?.stripeSubscriptionId).toBe("sub_new");
    });
});
