import { getBillingPortalUrlUseCase } from "@/lib/ee/billing";
import { LemonSqueezyApiAdapter } from "@/lib/ee/billing/lemonsqueezy.adapter";
import { describe, expect, test } from "bun:test";
import { FakePaymentProviderAdapter } from "./fakes/fake-payment-provider.adapter";
import { InMemoryUserBillingRepository } from "./fakes/in-memory-user-billing.repository";

const USER_ID = "11111111-2222-3333-4444-555555555555";

describe("getBillingPortalUrlUseCase", () => {
    test("returns the Customer Portal URL for a user with a provider customer", async () => {
        const provider = new FakePaymentProviderAdapter();
        provider.nextPortalResult = { url: "https://provider.test/portal/sess_1" };

        const users = new InMemoryUserBillingRepository();
        users.seed({
            userId: USER_ID,
            providerCustomerId: "cus_42",
            providerSubscriptionId: "sub_42",
            subscriptionStatus: "active",
        });

        const result = await getBillingPortalUrlUseCase({
            userId: USER_ID,
            returnUrl: "https://app.test/workspace",
            users,
            provider,
        });

        expect(result.url).toBe("https://provider.test/portal/sess_1");
        expect(provider.portalCalls).toHaveLength(1);
        expect(provider.portalCalls[0]?.customerId).toBe("cus_42");
        expect(provider.portalCalls[0]?.returnUrl).toBe("https://app.test/workspace");
    });

    test("returns the Lemon Squeezy customer_portal URL when wired to the LS adapter", async () => {
        const lsFetch = async (input: URL | RequestInfo): Promise<Response> => {
            const url = typeof input === "string" ? input : (input as URL).toString();
            expect(url).toBe("https://api.lemonsqueezy.com/v1/customers/99");
            return new Response(
                JSON.stringify({
                    data: {
                        id: "99",
                        type: "customers",
                        attributes: {
                            urls: {
                                customer_portal:
                                    "https://app.lemonsqueezy.com/billing?expires=1&signature=abc",
                            },
                        },
                    },
                }),
                { status: 200, headers: { "content-type": "application/vnd.api+json" } },
            );
        };
        const ls = new LemonSqueezyApiAdapter({
            apiKey: "ls_test_api_key",
            webhookSecret: "ls_test_webhook_secret",
            storeId: "store_123",
            fetch: lsFetch,
        });

        const users = new InMemoryUserBillingRepository();
        users.seed({
            userId: USER_ID,
            providerCustomerId: "99",
            providerSubscriptionId: "sub_99",
            subscriptionStatus: "active",
        });

        const result = await getBillingPortalUrlUseCase({
            userId: USER_ID,
            returnUrl: "https://app.test/workspace",
            users,
            provider: ls,
        });

        expect(result.url).toBe("https://app.lemonsqueezy.com/billing?expires=1&signature=abc");
    });

    test("throws when the user has no provider customer id yet", async () => {
        const provider = new FakePaymentProviderAdapter();
        const users = new InMemoryUserBillingRepository();
        users.seed({
            userId: USER_ID,
            providerCustomerId: null,
            providerSubscriptionId: null,
            subscriptionStatus: null,
        });

        await expect(
            getBillingPortalUrlUseCase({
                userId: USER_ID,
                returnUrl: "https://app.test/workspace",
                users,
                provider,
            }),
        ).rejects.toThrow();
    });

    test("throws when the user has never subscribed", async () => {
        const provider = new FakePaymentProviderAdapter();
        const users = new InMemoryUserBillingRepository();

        await expect(
            getBillingPortalUrlUseCase({
                userId: "00000000-0000-0000-0000-000000000000",
                returnUrl: "https://app.test/workspace",
                users,
                provider,
            }),
        ).rejects.toThrow();
    });
});
