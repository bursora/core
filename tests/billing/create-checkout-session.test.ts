/**
 * Checkout use case — variant resolution.
 *
 * Checkout no longer reads a variant id from env. It resolves the active cloud
 * plan from the (non-EE) plan read repo and passes that plan's `lsVariantId` to
 * the provider. With no active plan it throws a typed error rather than opening
 * an empty checkout.
 */

import {
    NoActiveCloudPlanError,
    createCheckoutSessionUseCase,
} from "@/lib/ee/billing/create-checkout-session.usecase";
import { FakePaymentProviderAdapter } from "@/tests/billing/fakes/fake-payment-provider.adapter";
import { InMemoryPlanRepository } from "@/tests/billing/fakes/in-memory-plan.repository";
import { describe, expect, test } from "bun:test";

const USER_ID = "11111111-2222-3333-4444-555555555555";

describe("createCheckoutSessionUseCase", () => {
    test("passes the active plan's lsVariantId to the provider", async () => {
        const provider = new FakePaymentProviderAdapter();
        const plans = new InMemoryPlanRepository();
        plans.seed({ lsVariantId: "variant_from_db" });

        const result = await createCheckoutSessionUseCase({
            userId: USER_ID,
            userEmail: "owner@example.com",
            successUrl: "https://app.test/ok",
            cancelUrl: "https://app.test/cancel",
            provider,
            plans,
        });

        expect(provider.checkoutCalls[0]?.variantId).toBe("variant_from_db");
        expect(provider.checkoutCalls[0]?.userId).toBe(USER_ID);
        expect(result.url).toBe(provider.nextCheckoutResult.url);
    });

    test("throws NoActiveCloudPlanError when no active plan exists", async () => {
        const provider = new FakePaymentProviderAdapter();
        const plans = new InMemoryPlanRepository();

        await expect(
            createCheckoutSessionUseCase({
                userId: USER_ID,
                userEmail: "owner@example.com",
                successUrl: "https://app.test/ok",
                cancelUrl: "https://app.test/cancel",
                provider,
                plans,
            }),
        ).rejects.toBeInstanceOf(NoActiveCloudPlanError);
        expect(provider.checkoutCalls).toHaveLength(0);
    });
});
