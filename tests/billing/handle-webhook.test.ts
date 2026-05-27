import type { WebhookEvent } from "@/lib/ee/billing";
import { handleWebhookUseCase } from "@/lib/ee/billing";
import { describe, expect, test } from "bun:test";
import { FakePaymentProviderAdapter } from "./fakes/fake-payment-provider.adapter";
import { InMemoryBillingWebhookEventStore } from "./fakes/in-memory-billing-webhook-event.store";
import { InMemoryWorkspaceBillingRepository } from "./fakes/in-memory-workspace-billing.repository";

const WORKSPACE_ID = "11111111-2222-3333-4444-555555555555";

const seedUnsubscribed = (
    repo: InMemoryWorkspaceBillingRepository,
    customerId: string | null = null,
    subId: string | null = null,
) => {
    repo.seed({
        workspaceId: WORKSPACE_ID,
        providerCustomerId: customerId,
        providerSubscriptionId: subId,
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
        providerCustomerId: customerId,
        providerSubscriptionId: subId,
        subscriptionStatus: "active",
    });
};

const runWebhook = async (
    event: WebhookEvent,
    workspaces: InMemoryWorkspaceBillingRepository,
    webhookEvents: InMemoryBillingWebhookEventStore = new InMemoryBillingWebhookEventStore(),
) => {
    const provider = new FakePaymentProviderAdapter();
    provider.nextEvent = event;
    return handleWebhookUseCase({
        rawBody: "raw",
        signatureHeader: "sig",
        provider,
        workspaces,
        webhookEvents,
    });
};

describe("handleWebhookUseCase", () => {
    test("rejects forged events (signature mismatch) with verified=false", async () => {
        const provider = new FakePaymentProviderAdapter();
        provider.verifyShouldThrow = true;
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedUnsubscribed(workspaces);

        const result = await handleWebhookUseCase({
            rawBody: "x",
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

        const result = await runWebhook(
            {
                id: "evt_basic_checkout",
                type: "subscription.activated",
                workspaceId: WORKSPACE_ID,
                customerId: "cus_99",
                subscriptionId: "sub_99",
            },
            workspaces,
        );

        expect(result.verified).toBe(true);
        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.subscriptionStatus).toBe("active");
        expect(row?.providerCustomerId).toBe("cus_99");
        expect(row?.providerSubscriptionId).toBe("sub_99");
    });

    test("subscription.canceled records subscription_status='canceled'", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedActive(workspaces, "cus_99", "sub_99");

        await runWebhook(
            {
                id: "evt_deleted_basic",
                type: "subscription.canceled",
                customerId: "cus_99",
                subscriptionId: "sub_99",
                status: "canceled",
            },
            workspaces,
        );

        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.subscriptionStatus).toBe("canceled");
    });

    test("subscription.updated writes the provider status verbatim", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedActive(workspaces, "cus_99", "sub_99");

        await runWebhook(
            {
                id: "evt_sub_past_due",
                type: "subscription.updated",
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
        const webhookEvents = new InMemoryBillingWebhookEventStore();

        await runWebhook(
            {
                id: "evt_checkout_1",
                type: "subscription.activated",
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
                type: "subscription.activated",
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
                type: "subscription.canceled",
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

    test("payment.succeeded flips past_due to active using customerId when workspaceId is absent", async () => {
        // LS `subscription_payment_success` deliveries do not always echo
        // `custom_data.workspace_id`. The handler must fall back to looking
        // up the workspace by `customerId` so a past_due workspace can
        // recover after the customer fixes their card.
        const workspaces = new InMemoryWorkspaceBillingRepository();
        workspaces.seed({
            workspaceId: WORKSPACE_ID,
            providerCustomerId: "cus_99",
            providerSubscriptionId: "sub_99",
            subscriptionStatus: "past_due",
        });

        const result = await runWebhook(
            {
                id: "evt_payment_succeeded",
                type: "payment.succeeded",
                // workspaceId absent — exactly what LS sends on a renewal.
                customerId: "cus_99",
                subscriptionId: "sub_99",
            },
            workspaces,
        );

        expect(result.verified).toBe(true);
        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.subscriptionStatus).toBe("active");
    });

    test("payment.failed marks the workspace past_due", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedActive(workspaces, "cus_99", "sub_99");

        const result = await runWebhook(
            {
                id: "evt_payment_failed",
                type: "payment.failed",
                customerId: "cus_99",
                subscriptionId: "sub_99",
            },
            workspaces,
        );

        expect(result.verified).toBe(true);
        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.subscriptionStatus).toBe("past_due");
    });

    test("subscription.expired marks the workspace canceled", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        seedActive(workspaces, "cus_99", "sub_99");

        const result = await runWebhook(
            {
                id: "evt_sub_expired",
                type: "subscription.expired",
                customerId: "cus_99",
                subscriptionId: "sub_99",
                status: "expired",
            },
            workspaces,
        );

        expect(result.verified).toBe(true);
        const row = await workspaces.findById(WORKSPACE_ID);
        expect(row?.subscriptionStatus).toBe("canceled");
    });

    test("order.refunded cancels subscription and clears refund eligibility", async () => {
        const workspaces = new InMemoryWorkspaceBillingRepository();
        const eligibleUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        workspaces.seed({
            workspaceId: WORKSPACE_ID,
            providerCustomerId: "cus_99",
            providerSubscriptionId: "sub_99",
            subscriptionStatus: "active",
            refundEligibleUntil: eligibleUntil,
        });

        const result = await runWebhook(
            {
                id: "evt_charge_refunded",
                type: "order.refunded",
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
