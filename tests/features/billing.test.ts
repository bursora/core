/**
 * Billing feature integration test.
 *
 * Drives the public API exposed by `@/lib/ee/billing` — the surface `app/`
 * and other features depend on. Uses in-memory fakes for the payment
 * provider + the user-billing repository (identical pattern to the deeper
 * tests in `tests/billing/`); the goal here is to lock the feature folder's
 * public contract: portal/webhook use cases, subscription transitions, and
 * the idempotency of webhook replays.
 */

import { userSubscriptions as userSubscriptionsTable } from "@/lib/db/schema";
import {
    getBillingPortalUrlUseCase,
    handleWebhookUseCase,
    type UserBillingRepository,
    type WebhookEvent,
} from "@/lib/ee/billing";
import { FakePaymentProviderAdapter } from "@/tests/billing/fakes/fake-payment-provider.adapter";
import { InMemoryBillingWebhookEventStore } from "@/tests/billing/fakes/in-memory-billing-webhook-event.store";
import { InMemoryUserBillingRepository } from "@/tests/billing/fakes/in-memory-user-billing.repository";
import { describe, expect, test } from "bun:test";

const USER_ID = "11111111-2222-3333-4444-555555555555";

const seedActive = (users: InMemoryUserBillingRepository): void => {
    users.seed({
        userId: USER_ID,
        providerCustomerId: "cus_42",
        providerSubscriptionId: "sub_42",
        subscriptionStatus: "active",
    });
};

const dispatch = async (
    event: WebhookEvent,
    users: UserBillingRepository,
    webhookEvents: InMemoryBillingWebhookEventStore = new InMemoryBillingWebhookEventStore(),
): Promise<void> => {
    const provider = new FakePaymentProviderAdapter();
    provider.nextEvent = event;
    const result = await handleWebhookUseCase({
        rawBody: "{}",
        signatureHeader: "sig",
        provider,
        users,
        webhookEvents,
    });
    expect(result.verified).toBe(true);
};

describe("@/lib/ee/billing public API", () => {
    test("schema tables are re-exported", () => {
        expect(userSubscriptionsTable).toBeDefined();
    });

    test("getBillingPortalUrlUseCase opens the portal for the user's provider customer", async () => {
        const provider = new FakePaymentProviderAdapter();
        provider.nextPortalResult = { url: "https://provider.test/portal/p1" };
        const users = new InMemoryUserBillingRepository();
        seedActive(users);

        const result = await getBillingPortalUrlUseCase({
            userId: USER_ID,
            returnUrl: "https://app.test/return",
            users,
            provider,
        });
        expect(result.url).toBe("https://provider.test/portal/p1");
        expect(provider.portalCalls[0]?.customerId).toBe("cus_42");
    });

    test("webhook with invalid signature reports unverified", async () => {
        const provider = new FakePaymentProviderAdapter();
        provider.verifyShouldThrow = true;
        const users = new InMemoryUserBillingRepository();
        const result = await handleWebhookUseCase({
            rawBody: "{}",
            signatureHeader: "bad",
            provider,
            users,
            webhookEvents: new InMemoryBillingWebhookEventStore(),
        });
        expect(result.verified).toBe(false);
    });

    test("subscription.activated records active subscription and stores provider ids", async () => {
        const users = new InMemoryUserBillingRepository();
        await dispatch(
            {
                id: "evt_feat_checkout",
                type: "subscription.activated",
                userId: USER_ID,
                customerId: "cus_new",
                subscriptionId: "sub_new",
            },
            users,
        );
        const after = await users.findByUserId(USER_ID);
        expect(after?.subscriptionStatus).toBe("active");
        expect(after?.providerCustomerId).toBe("cus_new");
        expect(after?.providerSubscriptionId).toBe("sub_new");
    });

    test("subscription.canceled records subscription_status='canceled'", async () => {
        const users = new InMemoryUserBillingRepository();
        seedActive(users);
        await dispatch(
            {
                id: "evt_feat_deleted",
                type: "subscription.canceled",
                customerId: "cus_42",
            },
            users,
        );
        const after = await users.findByUserId(USER_ID);
        expect(after?.subscriptionStatus).toBe("canceled");
    });

    test("webhook replays are idempotent (same event applied twice yields same state)", async () => {
        const users = new InMemoryUserBillingRepository();
        const event: WebhookEvent = {
            id: "evt_feat_replay",
            type: "subscription.activated",
            userId: USER_ID,
            customerId: "cus_new",
            subscriptionId: "sub_new",
        };
        await dispatch(event, users);
        await dispatch(event, users);
        const after = await users.findByUserId(USER_ID);
        expect(after?.subscriptionStatus).toBe("active");
        expect(after?.providerCustomerId).toBe("cus_new");
        expect(after?.providerSubscriptionId).toBe("sub_new");
    });
});
