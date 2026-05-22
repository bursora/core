import type { StripeWebhookEvent } from "@/lib/ee/billing";
import { handleStripeWebhookUseCase } from "@/lib/ee/billing";
import { describe, expect, test } from "bun:test";
import { FakeStripeAdapter } from "./fakes/fake-stripe.adapter";
import { InMemoryStripeWebhookEventStore } from "./fakes/in-memory-stripe-webhook-event.store";
import { InMemoryWorkspaceBillingRepository } from "./fakes/in-memory-workspace-billing.repository";

const WORKSPACE_ID = "11111111-2222-3333-4444-555555555555";

const seedUnsubscribed = (
    repo: InMemoryWorkspaceBillingRepository,
    customerId: string | null = null,
    subId: string | null = null,
) => {
    repo.seed({
        workspaceId: WORKSPACE_ID,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subId,
        subscriptionStatus: null,
    });
};

const seedActive = (
    repo: InMemoryWorkspaceBillingRepository,
    customerId: string,
    subId: string,
) => {
    repo.seed({
        workspaceId: WORKSPACE_ID,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subId,
        subscriptionStatus: "active",
    });
};

const runWebhook = async (
    event: StripeWebhookEvent,
    workspaces: InMemoryWorkspaceBillingRepository,
    webhookEvents: InMemoryStripeWebhookEventStore = new InMemoryStripeWebhookEventStore(),
) => {
    const stripe = new FakeStripeAdapter();
    stripe.nextEvent = event;
    return handleStripeWebhookUseCase({
        rawBody: "raw",
        signatureHeader: "sig",
        stripe,
        workspaces,
        webhookEvents,
    });
};

describe("handleStripeWebhookUseCase", () => {
    test("rejects forged events (signature mismatch) with verified=false", async () => {
        const stripe = new FakeStripeAdapter();
        stripe.verifyShouldThrow = true;
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedUnsubscribed(workspaces);

        const result = await handleStripeWebhookUseCase({
            rawBody: "x",
            signatureHeader: "bad",
            stripe,
            workspaces,
            webhookEvents: new InMemoryStripeWebhookEventStore(),
        });

        expect(result.verified).toBe(false);
    });

    test("checkout.session.completed records active subscription and stores stripe ids", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedUnsubscribed(workspaces);

        const result = await runWebhook(
            {
                id: "evt_basic_checkout",
                type: "checkout.session.completed",
                workspaceId: WORKSPACE_ID,
                customerId: "cus_99",
                subscriptionId: "sub_99",
            },
            workspaces,
        );

        expect(result.verified).toBe(true);
        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.subscriptionStatus).toBe("active");
        expect(row?.stripeCustomerId).toBe("cus_99");
        expect(row?.stripeSubscriptionId).toBe("sub_99");
    });

    test("customer.subscription.deleted records subscription_status='canceled'", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedActive(workspaces, "cus_99", "sub_99");

        await runWebhook(
            {
                id: "evt_deleted_basic",
                type: "customer.subscription.deleted",
                customerId: "cus_99",
                subscriptionId: "sub_99",
                status: "canceled",
            },
            workspaces,
        );

        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.subscriptionStatus).toBe("canceled");
    });

    test("customer.subscription.updated writes the Stripe status verbatim", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedActive(workspaces, "cus_99", "sub_99");

        await runWebhook(
            {
                id: "evt_sub_past_due",
                type: "customer.subscription.updated",
                customerId: "cus_99",
                subscriptionId: "sub_99",
                status: "past_due",
            },
            workspaces,
        );

        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.subscriptionStatus).toBe("past_due");
    });

    test("unknown events are accepted but do not change subscription state", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedActive(workspaces, "cus_99", "sub_99");

        const result = await runWebhook({ id: "evt_unknown", type: "unknown" }, workspaces);

        expect(result.verified).toBe(true);
        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.subscriptionStatus).toBe("active");
    });

    test("replayed event with the same id is a deduped no-op", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedUnsubscribed(workspaces);
        const webhookEvents = new InMemoryStripeWebhookEventStore();

        await runWebhook(
            {
                id: "evt_checkout_1",
                type: "checkout.session.completed",
                workspaceId: WORKSPACE_ID,
                customerId: "cus_99",
                subscriptionId: "sub_99",
            },
            workspaces,
            webhookEvents,
        );
        expect((await workspaces.findById(WORKSPACE_ID))?.subscriptionStatus).toBe("active");

        // Replay the original event. It must be a no-op.
        const replay = await runWebhook(
            {
                id: "evt_checkout_1",
                type: "checkout.session.completed",
                workspaceId: WORKSPACE_ID,
                customerId: "cus_99",
                subscriptionId: "sub_99",
            },
            workspaces,
            webhookEvents,
        );

        expect(replay.verified).toBe(true);
        expect(replay.deduped).toBe(true);
    });

    test("subscription event with unknown customer is a verified no-op", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedUnsubscribed(workspaces);

        const result = await runWebhook(
            {
                id: "evt_unknown_customer",
                type: "customer.subscription.deleted",
                customerId: "cus_unknown",
                subscriptionId: "sub_unknown",
                status: "canceled",
            },
            workspaces,
        );

        expect(result.verified).toBe(true);
        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.subscriptionStatus).toBeNull();
    });

    test("charge.refunded cancels subscription and clears refund eligibility", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        const eligibleUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        workspaces.seed({
            workspaceId: WORKSPACE_ID,
            stripeCustomerId: "cus_99",
            stripeSubscriptionId: "sub_99",
            subscriptionStatus: "active",
            refundEligibleUntil: eligibleUntil,
        });

        const result = await runWebhook(
            {
                id: "evt_charge_refunded",
                type: "charge.refunded",
                customerId: "cus_99",
            },
            workspaces,
        );

        expect(result.verified).toBe(true);
        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.subscriptionStatus).toBe("canceled");
        expect(row?.refundEligibleUntil).toBeNull();
    });
});
