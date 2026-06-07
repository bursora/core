import type { WebhookEvent } from "@/lib/ee/billing";
import { handleWebhookUseCase } from "@/lib/ee/billing";
import { describe, expect, test } from "bun:test";
import { FakePaymentProviderAdapter } from "./fakes/fake-payment-provider.adapter";
import { InMemoryBillingWebhookEventStore } from "./fakes/in-memory-billing-webhook-event.store";
import { InMemoryUserBillingRepository } from "./fakes/in-memory-user-billing.repository";

const USER_ID = "11111111-2222-3333-4444-555555555555";

const seedActive = (repo: InMemoryUserBillingRepository, customerId: string, subId: string) => {
    repo.seed({
        userId: USER_ID,
        providerCustomerId: customerId,
        providerSubscriptionId: subId,
        subscriptionStatus: "active",
    });
};

const runWebhook = async (
    event: WebhookEvent,
    users: InMemoryUserBillingRepository,
    webhookEvents: InMemoryBillingWebhookEventStore = new InMemoryBillingWebhookEventStore(),
) => {
    const provider = new FakePaymentProviderAdapter();
    provider.nextEvent = event;
    return handleWebhookUseCase({
        rawBody: "raw",
        signatureHeader: "sig",
        provider,
        users,
        webhookEvents,
    });
};

describe("handleWebhookUseCase", () => {
    test("rejects forged events (signature mismatch) with verified=false", async () => {
        const provider = new FakePaymentProviderAdapter();
        provider.verifyShouldThrow = true;

        const result = await handleWebhookUseCase({
            rawBody: "x",
            signatureHeader: "bad",
            provider,
            users: new InMemoryUserBillingRepository(),
            webhookEvents: new InMemoryBillingWebhookEventStore(),
        });

        expect(result.verified).toBe(false);
    });

    test("subscription.activated upserts the user with active status and provider ids", async () => {
        // No row pre-exists: the webhook resolves the user from the checkout
        // custom-data userId and inserts via upsert.
        const users = new InMemoryUserBillingRepository();

        const result = await runWebhook(
            {
                id: "evt_basic_checkout",
                type: "subscription.activated",
                userId: USER_ID,
                customerId: "cus_99",
                subscriptionId: "sub_99",
                variantId: "var_annual",
            },
            users,
        );

        expect(result.verified).toBe(true);
        const row = await users.findByUserId(USER_ID);
        expect(row?.subscriptionStatus).toBe("active");
        expect(row?.providerCustomerId).toBe("cus_99");
        expect(row?.providerSubscriptionId).toBe("sub_99");
        expect(row?.providerVariantId).toBe("var_annual");
        expect(row?.subscribedAt).not.toBeNull();
        expect(row?.refundEligibleUntil).not.toBeNull();
    });

    test("backfills the variant id from a later subscription.updated event", async () => {
        // A row activated before the variant id was captured (legacy, or an
        // activation event without it) gets the variant backfilled when LS next
        // delivers a subscription event carrying it.
        const users = new InMemoryUserBillingRepository();
        users.seed({
            userId: USER_ID,
            providerCustomerId: "cus_99",
            providerSubscriptionId: "sub_99",
            subscriptionStatus: "active",
        });
        expect((await users.findByUserId(USER_ID))?.providerVariantId).toBeNull();

        await runWebhook(
            {
                id: "evt_updated_variant",
                type: "subscription.updated",
                customerId: "cus_99",
                subscriptionId: "sub_99",
                variantId: "var_annual",
                status: "active",
            },
            users,
        );

        expect((await users.findByUserId(USER_ID))?.providerVariantId).toBe("var_annual");
    });

    test("subscription.activated writes the provider-reported status verbatim", async () => {
        // The handler must not hardcode `active`; an explicit status on the
        // event is written through unchanged (defaulting to `active` only
        // when the event omits one).
        const users = new InMemoryUserBillingRepository();

        await runWebhook(
            {
                id: "evt_activated_status",
                type: "subscription.activated",
                userId: USER_ID,
                customerId: "cus_99",
                subscriptionId: "sub_99",
                status: "past_due",
            },
            users,
        );

        const row = await users.findByUserId(USER_ID);
        expect(row?.subscriptionStatus).toBe("past_due");
    });

    test("subscription.canceled records subscription_status='canceled'", async () => {
        const users = new InMemoryUserBillingRepository();
        seedActive(users, "cus_99", "sub_99");

        await runWebhook(
            {
                id: "evt_deleted_basic",
                type: "subscription.canceled",
                customerId: "cus_99",
                subscriptionId: "sub_99",
                status: "canceled",
            },
            users,
        );

        const row = await users.findByUserId(USER_ID);
        expect(row?.subscriptionStatus).toBe("canceled");
    });

    test("subscription.updated writes the provider status verbatim", async () => {
        const users = new InMemoryUserBillingRepository();
        seedActive(users, "cus_99", "sub_99");

        await runWebhook(
            {
                id: "evt_sub_past_due",
                type: "subscription.updated",
                customerId: "cus_99",
                subscriptionId: "sub_99",
                status: "past_due",
            },
            users,
        );

        const row = await users.findByUserId(USER_ID);
        expect(row?.subscriptionStatus).toBe("past_due");
    });

    test("subscription.updated before activation backfills provider ids (no null-customer row)", async () => {
        // LS can deliver subscription.updated before — or instead of — the
        // activation event. With the checkout custom-data userId echoed, the row
        // must be created WITH the provider ids, never active-with-null-customer
        // (which would later break the billing portal).
        const users = new InMemoryUserBillingRepository();

        await runWebhook(
            {
                id: "evt_updated_first",
                type: "subscription.updated",
                userId: USER_ID,
                customerId: "cus_99",
                subscriptionId: "sub_99",
                status: "active",
            },
            users,
        );

        const row = await users.findByUserId(USER_ID);
        expect(row?.subscriptionStatus).toBe("active");
        expect(row?.providerCustomerId).toBe("cus_99");
        expect(row?.providerSubscriptionId).toBe("sub_99");
    });

    test("unknown events are accepted but do not change subscription state", async () => {
        const users = new InMemoryUserBillingRepository();
        seedActive(users, "cus_99", "sub_99");

        const result = await runWebhook({ id: "evt_unknown", type: "unknown" }, users);

        expect(result.verified).toBe(true);
        const row = await users.findByUserId(USER_ID);
        expect(row?.subscriptionStatus).toBe("active");
    });

    test("replayed event with the same id is a deduped no-op", async () => {
        const users = new InMemoryUserBillingRepository();
        const webhookEvents = new InMemoryBillingWebhookEventStore();

        await runWebhook(
            {
                id: "evt_checkout_1",
                type: "subscription.activated",
                userId: USER_ID,
                customerId: "cus_99",
                subscriptionId: "sub_99",
            },
            users,
            webhookEvents,
        );
        expect((await users.findByUserId(USER_ID))?.subscriptionStatus).toBe("active");

        // Replay the original event. It must be a no-op.
        const replay = await runWebhook(
            {
                id: "evt_checkout_1",
                type: "subscription.activated",
                userId: USER_ID,
                customerId: "cus_99",
                subscriptionId: "sub_99",
            },
            users,
            webhookEvents,
        );

        expect(replay.verified).toBe(true);
        expect(replay.deduped).toBe(true);
    });

    test("a side-effect failure rolls back the idempotency row so the retry re-runs", async () => {
        const users = new InMemoryUserBillingRepository();
        seedActive(users, "cus_99", "sub_99");
        const webhookEvents = new InMemoryBillingWebhookEventStore();
        const event: WebhookEvent = {
            id: "evt_retry_me",
            type: "subscription.updated",
            customerId: "cus_99",
            subscriptionId: "sub_99",
            status: "past_due",
        };

        // First delivery: the side effect throws. The handler must propagate
        // (so the route 500s) AND drop the idempotency row it just recorded.
        users.upsert = async () => {
            throw new Error("db down");
        };
        await expect(runWebhook(event, users, webhookEvents)).rejects.toThrow("db down");
        expect(webhookEvents.has("evt_retry_me")).toBe(false);

        // Provider retry: a healthy user repo applies the event for real
        // instead of finding it recorded-as-handled and skipping it.
        const healthy = new InMemoryUserBillingRepository();
        seedActive(healthy, "cus_99", "sub_99");
        const retry = await runWebhook(event, healthy, webhookEvents);

        expect(retry.verified).toBe(true);
        expect(retry.deduped ?? false).toBe(false);
        expect((await healthy.findByUserId(USER_ID))?.subscriptionStatus).toBe("past_due");
    });

    test("subscription event with unknown customer is a verified no-op", async () => {
        const users = new InMemoryUserBillingRepository();
        seedActive(users, "cus_99", "sub_99");

        const result = await runWebhook(
            {
                id: "evt_unknown_customer",
                type: "subscription.canceled",
                customerId: "cus_unknown",
                subscriptionId: "sub_unknown",
                status: "canceled",
            },
            users,
        );

        expect(result.verified).toBe(true);
        const row = await users.findByUserId(USER_ID);
        expect(row?.subscriptionStatus).toBe("active");
    });

    test("payment.succeeded flips past_due to active using customerId when userId is absent", async () => {
        // LS `subscription_payment_success` deliveries do not carry the
        // checkout custom-data userId. The handler must fall back to looking
        // up the user by `customerId` so a past_due account can recover after
        // the customer fixes their card.
        const users = new InMemoryUserBillingRepository();
        users.seed({
            userId: USER_ID,
            providerCustomerId: "cus_99",
            providerSubscriptionId: "sub_99",
            subscriptionStatus: "past_due",
        });

        const result = await runWebhook(
            {
                id: "evt_payment_succeeded",
                type: "payment.succeeded",
                // userId absent — exactly what LS sends on a renewal.
                customerId: "cus_99",
                subscriptionId: "sub_99",
            },
            users,
        );

        expect(result.verified).toBe(true);
        const row = await users.findByUserId(USER_ID);
        expect(row?.subscriptionStatus).toBe("active");
    });

    test("payment.failed marks the user past_due", async () => {
        const users = new InMemoryUserBillingRepository();
        seedActive(users, "cus_99", "sub_99");

        const result = await runWebhook(
            {
                id: "evt_payment_failed",
                type: "payment.failed",
                customerId: "cus_99",
                subscriptionId: "sub_99",
            },
            users,
        );

        expect(result.verified).toBe(true);
        const row = await users.findByUserId(USER_ID);
        expect(row?.subscriptionStatus).toBe("past_due");
    });

    test("subscription.expired marks the user canceled", async () => {
        const users = new InMemoryUserBillingRepository();
        seedActive(users, "cus_99", "sub_99");

        const result = await runWebhook(
            {
                id: "evt_sub_expired",
                type: "subscription.expired",
                customerId: "cus_99",
                subscriptionId: "sub_99",
                status: "expired",
            },
            users,
        );

        expect(result.verified).toBe(true);
        const row = await users.findByUserId(USER_ID);
        expect(row?.subscriptionStatus).toBe("canceled");
    });

    test("order.refunded cancels subscription and clears refund eligibility", async () => {
        const users = new InMemoryUserBillingRepository();
        const eligibleUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        users.seed({
            userId: USER_ID,
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
            users,
        );

        expect(result.verified).toBe(true);
        const row = await users.findByUserId(USER_ID);
        expect(row?.subscriptionStatus).toBe("canceled");
        expect(row?.refundEligibleUntil).toBeNull();
    });
});
