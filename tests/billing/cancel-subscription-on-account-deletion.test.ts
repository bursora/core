import {
    cancelSubscriptionOnAccountDeletionUseCase,
    type RefundEligibleInfo,
} from "@/lib/ee/billing";
import { describe, expect, test } from "bun:test";
import { FakePaymentProviderAdapter } from "./fakes/fake-payment-provider.adapter";
import { InMemoryUserBillingRepository } from "./fakes/in-memory-user-billing.repository";

const USER_ID = "11111111-2222-3333-4444-555555555555";
const NOW = new Date("2026-06-04T00:00:00.000Z");

describe("cancelSubscriptionOnAccountDeletionUseCase", () => {
    test("cancels the provider subscription for an active billable account", async () => {
        const provider = new FakePaymentProviderAdapter();
        const users = new InMemoryUserBillingRepository();
        users.seed({
            userId: USER_ID,
            providerCustomerId: "cus_1",
            providerSubscriptionId: "sub_1",
            subscriptionStatus: "active",
        });

        const result = await cancelSubscriptionOnAccountDeletionUseCase({
            userId: USER_ID,
            now: NOW,
            users,
            provider,
        });

        expect(provider.cancelSubscriptionCalls).toEqual(["sub_1"]);
        expect(result).toEqual({ canceled: true, refundEligible: false });
    });

    test("cancels a past_due subscription (still billable)", async () => {
        const provider = new FakePaymentProviderAdapter();
        const users = new InMemoryUserBillingRepository();
        users.seed({
            userId: USER_ID,
            providerSubscriptionId: "sub_pd",
            subscriptionStatus: "past_due",
        });

        const result = await cancelSubscriptionOnAccountDeletionUseCase({
            userId: USER_ID,
            now: NOW,
            users,
            provider,
        });

        expect(provider.cancelSubscriptionCalls).toEqual(["sub_pd"]);
        expect(result.canceled).toBe(true);
    });

    test("no-op when the user never subscribed (no billing row)", async () => {
        const provider = new FakePaymentProviderAdapter();
        const users = new InMemoryUserBillingRepository();

        const result = await cancelSubscriptionOnAccountDeletionUseCase({
            userId: USER_ID,
            now: NOW,
            users,
            provider,
        });

        expect(provider.cancelSubscriptionCalls).toHaveLength(0);
        expect(result).toEqual({ canceled: false, refundEligible: false });
    });

    test("no-op when there is a row but no subscription id", async () => {
        const provider = new FakePaymentProviderAdapter();
        const users = new InMemoryUserBillingRepository();
        users.seed({
            userId: USER_ID,
            providerCustomerId: "cus_1",
            providerSubscriptionId: null,
            subscriptionStatus: null,
        });

        const result = await cancelSubscriptionOnAccountDeletionUseCase({
            userId: USER_ID,
            now: NOW,
            users,
            provider,
        });

        expect(provider.cancelSubscriptionCalls).toHaveLength(0);
        expect(result.canceled).toBe(false);
    });

    test("no-op for a terminal status (already cancelled/expired)", async () => {
        const provider = new FakePaymentProviderAdapter();
        const users = new InMemoryUserBillingRepository();
        users.seed({
            userId: USER_ID,
            providerSubscriptionId: "sub_dead",
            subscriptionStatus: "expired",
        });

        const result = await cancelSubscriptionOnAccountDeletionUseCase({
            userId: USER_ID,
            now: NOW,
            users,
            provider,
        });

        expect(provider.cancelSubscriptionCalls).toHaveLength(0);
        expect(result.canceled).toBe(false);
    });

    test("flags refund-eligible deletion for manual review, still cancels", async () => {
        const provider = new FakePaymentProviderAdapter();
        const users = new InMemoryUserBillingRepository();
        users.seed({
            userId: USER_ID,
            providerCustomerId: "cus_9",
            providerSubscriptionId: "sub_9",
            subscriptionStatus: "active",
            refundEligibleUntil: new Date("2026-06-20T00:00:00.000Z"),
        });

        const flagged: RefundEligibleInfo[] = [];
        const result = await cancelSubscriptionOnAccountDeletionUseCase({
            userId: USER_ID,
            now: NOW,
            users,
            provider,
            onRefundEligible: (info) => flagged.push(info),
        });

        expect(provider.cancelSubscriptionCalls).toEqual(["sub_9"]);
        expect(result).toEqual({ canceled: true, refundEligible: true });
        expect(flagged).toEqual([
            {
                userId: USER_ID,
                providerSubscriptionId: "sub_9",
                providerCustomerId: "cus_9",
                refundEligibleUntil: new Date("2026-06-20T00:00:00.000Z"),
            },
        ]);
    });

    test("propagates a provider cancel failure without flagging a refund", async () => {
        const provider = new FakePaymentProviderAdapter();
        provider.cancelSubscriptionShouldThrow = true;
        const users = new InMemoryUserBillingRepository();
        users.seed({
            userId: USER_ID,
            providerSubscriptionId: "sub_x",
            subscriptionStatus: "active",
            refundEligibleUntil: new Date("2026-06-20T00:00:00.000Z"),
        });

        const flagged: RefundEligibleInfo[] = [];
        // A failed cancel must reject so the purge aborts before erasing the
        // user (retried next run) and never flags a refund it did not action.
        await expect(
            cancelSubscriptionOnAccountDeletionUseCase({
                userId: USER_ID,
                now: NOW,
                users,
                provider,
                onRefundEligible: (info) => flagged.push(info),
            }),
        ).rejects.toThrow();
        expect(flagged).toHaveLength(0);
    });

    test("does not flag a deletion past the refund window", async () => {
        const provider = new FakePaymentProviderAdapter();
        const users = new InMemoryUserBillingRepository();
        users.seed({
            userId: USER_ID,
            providerSubscriptionId: "sub_late",
            subscriptionStatus: "active",
            refundEligibleUntil: new Date("2026-05-01T00:00:00.000Z"),
        });

        const flagged: RefundEligibleInfo[] = [];
        const result = await cancelSubscriptionOnAccountDeletionUseCase({
            userId: USER_ID,
            now: NOW,
            users,
            provider,
            onRefundEligible: (info) => flagged.push(info),
        });

        expect(provider.cancelSubscriptionCalls).toEqual(["sub_late"]);
        expect(result).toEqual({ canceled: true, refundEligible: false });
        expect(flagged).toHaveLength(0);
    });
});
