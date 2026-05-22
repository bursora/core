/**
 * Live Stripe-test-mode integration check. Skipped automatically unless
 * `STRIPE_SECRET_KEY` is set, so the default `bun test` run stays hermetic.
 *
 * Verifying the full upgrade + cancel cycle against Stripe's real test
 * environment requires manual ops (Stripe CLI `stripe listen` forwarding
 * webhooks, browser-driven Checkout). This marker test asserts only that
 * adapter construction and a Checkout Session creation round-trip succeed,
 * giving confidence the wiring talks to Stripe at all.
 *
 * Run with:
 *   STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_ID_TEAM=price_... \
 *     bun test tests/billing/stripe-integration.test.ts
 */

import { StripeApiAdapter } from "@/lib/ee/billing";
import { describe, expect, test } from "bun:test";

const liveKey = process.env.STRIPE_SECRET_KEY;
const livePrice = process.env.STRIPE_PRICE_ID_TEAM;
const skip = !liveKey || !liveKey.startsWith("sk_test_") || !livePrice;

const describeOrSkip = skip ? describe.skip : describe;

describeOrSkip("stripe live test-mode integration", () => {
    test("creates a Checkout Session against Stripe test mode", async () => {
        const adapter = new StripeApiAdapter({
            secretKey: liveKey!,
            webhookSecret: "whsec_unused_in_this_test",
            timeoutMs: 30_000,
        });

        const session = await adapter.createCheckoutSession({
            workspaceId: "11111111-2222-3333-4444-555555555555",
            userEmail: "integration@bursora.test",
            priceId: livePrice!,
            successUrl: "https://example.com/ok",
            cancelUrl: "https://example.com/cancel",
        });

        expect(session.id.startsWith("cs_")).toBe(true);
        expect(session.url).toMatch(/^https:\/\//);
    });
});
