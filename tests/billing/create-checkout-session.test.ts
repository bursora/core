import { createCheckoutSessionUseCase } from "@/lib/ee/billing";
import { describe, expect, test } from "bun:test";
import { FakeStripeAdapter } from "./fakes/fake-stripe.adapter";

const WORKSPACE_ID = "11111111-2222-3333-4444-555555555555";

describe("createCheckoutSessionUseCase", () => {
    test("forwards line items, mode, metadata, urls and customer email to the adapter", async () => {
        const stripe = new FakeStripeAdapter();
        stripe.nextCheckoutResult = {
            id: "cs_123",
            url: "https://stripe.test/checkout/cs_123",
        };

        const result = await createCheckoutSessionUseCase({
            workspaceId: WORKSPACE_ID,
            userEmail: "founder@example.com",
            priceId: "price_team_149",
            successUrl: "https://app.test/workspace/W/settings?billing=ok",
            cancelUrl: "https://app.test/workspace/W/settings?billing=cancel",
            stripe,
        });

        expect(result.url).toBe("https://stripe.test/checkout/cs_123");
        expect(stripe.checkoutCalls).toHaveLength(1);
        const call = stripe.checkoutCalls[0]!;
        expect(call.priceId).toBe("price_team_149");
        expect(call.workspaceId).toBe(WORKSPACE_ID);
        expect(call.userEmail).toBe("founder@example.com");
        expect(call.successUrl).toBe("https://app.test/workspace/W/settings?billing=ok");
        expect(call.cancelUrl).toBe("https://app.test/workspace/W/settings?billing=cancel");
    });
});
