import { getBillingPortalUrlUseCase } from "@/lib/ee/billing";
import { describe, expect, test } from "bun:test";
import { FakeStripeAdapter } from "./fakes/fake-stripe.adapter";
import { InMemoryWorkspaceBillingRepository } from "./fakes/in-memory-workspace-billing.repository";

const WORKSPACE_ID = "11111111-2222-3333-4444-555555555555";

describe("getBillingPortalUrlUseCase", () => {
    test("returns the Customer Portal URL for a workspace with a Stripe customer", async () => {
        const stripe = new FakeStripeAdapter();
        stripe.nextPortalResult = { url: "https://stripe.test/portal/sess_1" };

        const workspaces = new InMemoryWorkspaceBillingRepository();
        workspaces.seed({
            workspaceId: WORKSPACE_ID,
            stripeCustomerId: "cus_42",
            stripeSubscriptionId: "sub_42",
            subscriptionStatus: "active",
        });

        const result = await getBillingPortalUrlUseCase({
            workspaceId: WORKSPACE_ID,
            returnUrl: "https://app.test/workspace/W/settings",
            workspaces,
            stripe,
        });

        expect(result.url).toBe("https://stripe.test/portal/sess_1");
        expect(stripe.portalCalls).toHaveLength(1);
        expect(stripe.portalCalls[0]?.customerId).toBe("cus_42");
        expect(stripe.portalCalls[0]?.returnUrl).toBe("https://app.test/workspace/W/settings");
    });

    test("throws when the workspace has no Stripe customer id yet", async () => {
        const stripe = new FakeStripeAdapter();
        const workspaces = new InMemoryWorkspaceBillingRepository();
        workspaces.seed({
            workspaceId: WORKSPACE_ID,
            stripeCustomerId: null,
            stripeSubscriptionId: null,
            subscriptionStatus: null,
        });

        await expect(
            getBillingPortalUrlUseCase({
                workspaceId: WORKSPACE_ID,
                returnUrl: "https://app.test/workspace/W/settings",
                workspaces,
                stripe,
            }),
        ).rejects.toThrow();
    });

    test("throws when the workspace does not exist", async () => {
        const stripe = new FakeStripeAdapter();
        const workspaces = new InMemoryWorkspaceBillingRepository();

        await expect(
            getBillingPortalUrlUseCase({
                workspaceId: "00000000-0000-0000-0000-000000000000",
                returnUrl: "https://app.test/workspace/W/settings",
                workspaces,
                stripe,
            }),
        ).rejects.toThrow();
    });
});
