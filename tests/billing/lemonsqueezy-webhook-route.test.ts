/**
 * Lemon Squeezy webhook route — HTTP surface check.
 *
 * The route translates between Next.js `Request`/`NextResponse` and the
 * neutral `handleWebhook` use case. It must:
 *   - Read the raw body (so HMAC verification sees the exact bytes LS sent)
 *   - Pull the `X-Signature` header
 *   - Return 200 on verified + 200 on duplicate (deduped) + 400 on signature
 *     failure or missing signature
 */

import type { BillingWebhookEventStore } from "@/lib/ee/billing";
import { setBillingDepsForTesting } from "@/lib/ee/billing/server";
import { POST } from "@/lib/ee/routes/lemonsqueezy-webhook";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { FakePaymentProviderAdapter } from "./fakes/fake-payment-provider.adapter";
import { InMemoryBillingWebhookEventStore } from "./fakes/in-memory-billing-webhook-event.store";
import { InMemoryPlanRepository } from "./fakes/in-memory-plan.repository";
import { InMemoryUserBillingRepository } from "./fakes/in-memory-user-billing.repository";

const USER_ID = "11111111-2222-3333-4444-555555555555";

const makeRequest = (body: string, signature: string | null): Request => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (signature !== null) headers["x-signature"] = signature;
    return new Request("https://app.test/api/webhooks/lemonsqueezy", {
        method: "POST",
        headers,
        body,
    });
};

let provider: FakePaymentProviderAdapter;
let users: InMemoryUserBillingRepository;
let webhookEvents: InMemoryBillingWebhookEventStore;

beforeEach(() => {
    provider = new FakePaymentProviderAdapter();
    users = new InMemoryUserBillingRepository();
    webhookEvents = new InMemoryBillingWebhookEventStore();
    setBillingDepsForTesting({
        provider,
        users,
        webhookEvents,
        plans: new InMemoryPlanRepository(),
        appUrl: "https://app.test",
    });
});

afterEach(() => {
    setBillingDepsForTesting(null);
});

describe("/api/webhooks/lemonsqueezy", () => {
    test("returns 200 when the use case verifies and updates state", async () => {
        provider.nextEvent = {
            id: "evt_1",
            type: "subscription.activated",
            userId: USER_ID,
            customerId: "cus_99",
            subscriptionId: "sub_99",
        };

        const response = await POST(makeRequest("{}", "valid-sig"));

        expect(response.status).toBe(200);
        const row = await users.findByUserId(USER_ID);
        expect(row?.subscriptionStatus).toBe("active");
    });

    test("returns 200 on a deduped delivery", async () => {
        provider.nextEvent = {
            id: "evt_dup",
            type: "subscription.activated",
            userId: USER_ID,
            customerId: "cus_99",
            subscriptionId: "sub_99",
        };
        // First call writes the row.
        await POST(makeRequest("{}", "valid-sig"));
        // Second call with the same id should dedupe and still 200.
        const second = await POST(makeRequest("{}", "valid-sig"));
        expect(second.status).toBe(200);
    });

    test("returns 400 when the signature header is missing", async () => {
        const response = await POST(makeRequest("{}", null));
        expect(response.status).toBe(400);
    });

    test("returns 400 when signature verification fails", async () => {
        provider.verifyShouldThrow = true;
        const response = await POST(makeRequest("{}", "bad-sig"));
        expect(response.status).toBe(400);
    });

    test("on a downstream failure logs only message + name, never the raw error", async () => {
        provider.nextEvent = {
            id: "evt_boom",
            type: "subscription.activated",
            userId: USER_ID,
            customerId: "cus_99",
            subscriptionId: "sub_99",
        };
        // A real error carries a stack and may carry request ids / PII on
        // arbitrary fields. None of that may reach the logs.
        const stackMarker = "secret-stack-frame-do-not-leak";
        const sensitiveField = "victim@example.com";
        const boom = new Error("db down: dsn=postgres://user:p4ssw0rd@host/db") as Error & {
            customerEmail?: string;
        };
        boom.stack = `Error: db down\n    at ${stackMarker} (server.ts:1:1)`;
        boom.customerEmail = sensitiveField;
        const throwingEvents: BillingWebhookEventStore = {
            async recordIfNew() {
                throw boom;
            },
            async deleteByEventId() {},
            async pruneOlderThan() {
                return 0;
            },
        };
        setBillingDepsForTesting({
            provider,
            users,
            webhookEvents: throwingEvents,
            plans: new InMemoryPlanRepository(),
            appUrl: "https://app.test",
        });
        const errorSpy = spyOn(console, "error").mockImplementation(() => {});

        const response = await POST(makeRequest("{}", "valid-sig"));

        expect(response.status).toBe(500);
        const call = errorSpy.mock.calls.find((c) => c[0] === "lemonsqueezy.webhook.error");
        expect(call).toBeDefined();
        const payload = call?.[1] as Record<string, unknown>;
        expect(payload).toEqual({
            event: "lemonsqueezy.webhook.error",
            message: boom.message,
            name: "Error",
        });
        // The raw error object, its stack, and any extra fields must be absent
        // from every argument passed to the logger.
        const serialized = JSON.stringify(errorSpy.mock.calls);
        expect(serialized.includes(stackMarker)).toBe(false);
        expect(serialized.includes(sensitiveField)).toBe(false);
        expect(serialized.includes("customerEmail")).toBe(false);

        errorSpy.mockRestore();
    });
});
