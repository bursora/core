/**
 * Unit tests for the Lemon Squeezy adapter — checkout creation + webhook
 * verification. The adapter accepts an injected `fetch` so we can pin the
 * exact request payload and stub responses without spinning a real HTTP
 * server.
 */

import { LemonSqueezyApiAdapter } from "@/lib/ee/billing/lemonsqueezy.adapter";
import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";

const WORKSPACE_ID = "11111111-2222-3333-4444-555555555555";
const STORE_ID = "1";
const VARIANT_ID = "variant_456";
const API_KEY = "ls_test_api_key";
const WEBHOOK_SECRET = "ls_test_webhook_secret";

interface FetchCall {
    readonly url: string;
    readonly init: RequestInit;
}

type Fetcher = (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>;

const recordingFetch = (responses: readonly Response[]) => {
    const calls: FetchCall[] = [];
    let i = 0;
    const fetcher: Fetcher = async (input, init) => {
        const url = typeof input === "string" ? input : (input as URL).toString();
        calls.push({ url, init: init ?? {} });
        const response = responses[i++];
        if (!response) throw new Error("recordingFetch: no more stub responses");
        return response;
    };
    return { fetcher, calls };
};

const sign = (rawBody: string, secret: string): string =>
    createHmac("sha256", secret).update(rawBody).digest("hex");

describe("LemonSqueezyApiAdapter.createCheckoutSession", () => {
    test("POSTs to /v1/checkouts with store, variant, custom workspace id, email, redirect", async () => {
        const { fetcher, calls } = recordingFetch([
            new Response(
                JSON.stringify({
                    data: {
                        id: "ckt_1",
                        attributes: { url: "https://app.lemonsqueezy.com/checkout/ckt_1" },
                    },
                }),
                { status: 201, headers: { "content-type": "application/vnd.api+json" } },
            ),
        ]);

        const adapter = new LemonSqueezyApiAdapter({
            apiKey: API_KEY,
            webhookSecret: WEBHOOK_SECRET,
            storeId: STORE_ID,
            fetch: fetcher,
        });

        const result = await adapter.createCheckoutSession({
            workspaceId: WORKSPACE_ID,
            userEmail: "founder@example.com",
            variantId: VARIANT_ID,
            successUrl: "https://app.test/ok",
            cancelUrl: "https://app.test/cancel",
        });

        expect(result.url).toBe("https://app.lemonsqueezy.com/checkout/ckt_1");
        expect(result.id).toBe("ckt_1");
        expect(calls).toHaveLength(1);
        const call = calls[0]!;
        expect(call.url).toBe("https://api.lemonsqueezy.com/v1/checkouts");
        expect(call.init.method).toBe("POST");
        const headers = new Headers(call.init.headers);
        expect(headers.get("Authorization")).toBe(`Bearer ${API_KEY}`);
        expect(headers.get("Accept")).toBe("application/vnd.api+json");
        expect(headers.get("Content-Type")).toBe("application/vnd.api+json");

        const body = JSON.parse(call.init.body as string) as Record<string, unknown>;
        const data = body.data as {
            type: string;
            attributes: Record<string, unknown>;
            relationships: Record<string, unknown>;
        };
        expect(data.type).toBe("checkouts");
        const attrs = data.attributes as Record<string, unknown>;
        const checkoutData = attrs.checkout_data as Record<string, unknown>;
        expect(checkoutData.email).toBe("founder@example.com");
        expect((checkoutData.custom as Record<string, string>).workspace_id).toBe(WORKSPACE_ID);
        const productOptions = attrs.product_options as Record<string, string>;
        expect(productOptions.redirect_url).toBe("https://app.test/ok");

        const relationships = data.relationships as Record<
            string,
            { data: { id: string; type: string } }
        >;
        expect(relationships.store?.data.id).toBe(STORE_ID);
        expect(relationships.store?.data.type).toBe("stores");
        expect(relationships.variant?.data.id).toBe(VARIANT_ID);
        expect(relationships.variant?.data.type).toBe("variants");
    });

    test("throws when Lemon Squeezy returns a non-2xx status", async () => {
        const { fetcher } = recordingFetch([
            new Response(JSON.stringify({ errors: [{ detail: "Invalid variant" }] }), {
                status: 422,
                headers: { "content-type": "application/vnd.api+json" },
            }),
        ]);

        const adapter = new LemonSqueezyApiAdapter({
            apiKey: API_KEY,
            webhookSecret: WEBHOOK_SECRET,
            storeId: STORE_ID,
            fetch: fetcher,
        });

        await expect(
            adapter.createCheckoutSession({
                workspaceId: WORKSPACE_ID,
                userEmail: "founder@example.com",
                variantId: VARIANT_ID,
                successUrl: "https://app.test/ok",
                cancelUrl: "https://app.test/cancel",
            }),
        ).rejects.toThrow();
    });
});

describe("LemonSqueezyApiAdapter.createPortalSession", () => {
    test("GETs /v1/customers/{id} and returns the signed customer_portal URL", async () => {
        const { fetcher, calls } = recordingFetch([
            new Response(
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
            ),
        ]);

        const adapter = new LemonSqueezyApiAdapter({
            apiKey: API_KEY,
            webhookSecret: WEBHOOK_SECRET,
            storeId: STORE_ID,
            fetch: fetcher,
        });

        const result = await adapter.createPortalSession({
            customerId: "99",
            returnUrl: "https://app.test/workspace/W/settings",
        });

        expect(result.url).toBe("https://app.lemonsqueezy.com/billing?expires=1&signature=abc");
        expect(calls).toHaveLength(1);
        const call = calls[0]!;
        expect(call.url).toBe("https://api.lemonsqueezy.com/v1/customers/99");
        expect(call.init.method ?? "GET").toBe("GET");
        const headers = new Headers(call.init.headers);
        expect(headers.get("Authorization")).toBe(`Bearer ${API_KEY}`);
        expect(headers.get("Accept")).toBe("application/vnd.api+json");
    });

    test("throws when Lemon Squeezy returns a non-2xx status", async () => {
        const { fetcher } = recordingFetch([
            new Response(JSON.stringify({ errors: [{ detail: "Not found" }] }), {
                status: 404,
                headers: { "content-type": "application/vnd.api+json" },
            }),
        ]);

        const adapter = new LemonSqueezyApiAdapter({
            apiKey: API_KEY,
            webhookSecret: WEBHOOK_SECRET,
            storeId: STORE_ID,
            fetch: fetcher,
        });

        await expect(
            adapter.createPortalSession({
                customerId: "missing",
                returnUrl: "https://app.test/workspace/W/settings",
            }),
        ).rejects.toThrow();
    });

    test("throws when the customer record has no customer_portal url", async () => {
        const { fetcher } = recordingFetch([
            new Response(
                JSON.stringify({
                    data: {
                        id: "99",
                        type: "customers",
                        attributes: { urls: {} },
                    },
                }),
                { status: 200, headers: { "content-type": "application/vnd.api+json" } },
            ),
        ]);

        const adapter = new LemonSqueezyApiAdapter({
            apiKey: API_KEY,
            webhookSecret: WEBHOOK_SECRET,
            storeId: STORE_ID,
            fetch: fetcher,
        });

        await expect(
            adapter.createPortalSession({
                customerId: "99",
                returnUrl: "https://app.test/workspace/W/settings",
            }),
        ).rejects.toThrow();
    });
});

describe("LemonSqueezyApiAdapter.verifyAndParseEvent", () => {
    const adapter = new LemonSqueezyApiAdapter({
        apiKey: API_KEY,
        webhookSecret: WEBHOOK_SECRET,
        storeId: STORE_ID,
    });

    const subscriptionCreatedBody = JSON.stringify({
        meta: {
            event_name: "subscription_created",
            custom_data: { workspace_id: WORKSPACE_ID },
        },
        data: {
            id: "12345",
            type: "subscriptions",
            attributes: {
                store_id: 1,
                customer_id: 99,
                status: "active",
            },
        },
    });

    test("accepts a body signed with the configured secret", () => {
        const signature = sign(subscriptionCreatedBody, WEBHOOK_SECRET);
        const event = adapter.verifyAndParseEvent({
            rawBody: subscriptionCreatedBody,
            signatureHeader: signature,
        });
        expect(event.type).toBe("subscription.activated");
        expect(event.workspaceId).toBe(WORKSPACE_ID);
        expect(event.customerId).toBe("99");
        expect(event.subscriptionId).toBe("12345");
    });

    test("rejects a tampered body", () => {
        const tampered = subscriptionCreatedBody.replace(WORKSPACE_ID, "deadbeef");
        const signature = sign(subscriptionCreatedBody, WEBHOOK_SECRET);
        expect(() =>
            adapter.verifyAndParseEvent({
                rawBody: tampered,
                signatureHeader: signature,
            }),
        ).toThrow();
    });

    test("rejects a bit-flipped signature of the same length", () => {
        const good = sign(subscriptionCreatedBody, WEBHOOK_SECRET);
        // Flip the last hex char so the byte-length matches but the bytes differ.
        const lastChar = good.charAt(good.length - 1);
        const flippedChar = lastChar === "0" ? "1" : "0";
        const bad = good.slice(0, -1) + flippedChar;
        expect(bad).toHaveLength(good.length);
        expect(() =>
            adapter.verifyAndParseEvent({
                rawBody: subscriptionCreatedBody,
                signatureHeader: bad,
            }),
        ).toThrow();
    });

    test("rejects a missing signature header", () => {
        expect(() =>
            adapter.verifyAndParseEvent({
                rawBody: subscriptionCreatedBody,
                signatureHeader: "",
            }),
        ).toThrow();
    });

    test("maps subscription_payment_success to payment.succeeded", () => {
        // The payment-success delivery is the recurring-renewal signal. It
        // means the customer paid; flipping past_due → active belongs in the
        // payment.succeeded handler. subscription.activated is reserved for
        // the first-checkout transition (subscription_created).
        const body = JSON.stringify({
            meta: {
                event_name: "subscription_payment_success",
                custom_data: { workspace_id: WORKSPACE_ID },
            },
            data: {
                id: "in_1",
                type: "subscription-invoices",
                attributes: {
                    store_id: 1,
                    customer_id: 99,
                    subscription_id: 12345,
                    status: "paid",
                },
            },
        });
        const signature = sign(body, WEBHOOK_SECRET);
        const event = adapter.verifyAndParseEvent({
            rawBody: body,
            signatureHeader: signature,
        });
        expect(event.type).toBe("payment.succeeded");
        expect(event.workspaceId).toBe(WORKSPACE_ID);
        expect(event.customerId).toBe("99");
        expect(event.invoiceId).toBe("in_1");
    });

    test("maps subscription_cancelled to subscription.canceled", () => {
        const body = JSON.stringify({
            meta: { event_name: "subscription_cancelled" },
            data: {
                id: "12345",
                type: "subscriptions",
                attributes: {
                    store_id: 1,
                    customer_id: 99,
                    status: "cancelled",
                },
            },
        });
        const signature = sign(body, WEBHOOK_SECRET);
        const event = adapter.verifyAndParseEvent({
            rawBody: body,
            signatureHeader: signature,
        });
        expect(event.type).toBe("subscription.canceled");
    });

    test("maps subscription_updated to subscription.updated and forwards provider status", () => {
        const body = JSON.stringify({
            meta: {
                event_name: "subscription_updated",
                custom_data: { workspace_id: WORKSPACE_ID },
            },
            data: {
                id: "12345",
                type: "subscriptions",
                attributes: {
                    store_id: 1,
                    customer_id: 99,
                    status: "past_due",
                },
            },
        });
        const signature = sign(body, WEBHOOK_SECRET);
        const event = adapter.verifyAndParseEvent({
            rawBody: body,
            signatureHeader: signature,
        });
        expect(event.type).toBe("subscription.updated");
        expect(event.status).toBe("past_due");
        expect(event.customerId).toBe("99");
        expect(event.subscriptionId).toBe("12345");
    });

    test("distinct subscription_updated deliveries get distinct event ids via updated_at", () => {
        const makeBody = (updatedAt: string, status: string) =>
            JSON.stringify({
                meta: { event_name: "subscription_updated" },
                data: {
                    id: "12345",
                    type: "subscriptions",
                    attributes: { store_id: 1, customer_id: 99, status, updated_at: updatedAt },
                },
            });

        const first = makeBody("2026-01-01T00:00:00Z", "past_due");
        const second = makeBody("2026-02-01T00:00:00Z", "active");
        const firstEvent = adapter.verifyAndParseEvent({
            rawBody: first,
            signatureHeader: sign(first, WEBHOOK_SECRET),
        });
        const secondEvent = adapter.verifyAndParseEvent({
            rawBody: second,
            signatureHeader: sign(second, WEBHOOK_SECRET),
        });
        const retry = adapter.verifyAndParseEvent({
            rawBody: first,
            signatureHeader: sign(first, WEBHOOK_SECRET),
        });

        // Two genuinely different transitions on the same subscription must not
        // collide, but a true retry of the same delivery must dedupe.
        expect(firstEvent.id).not.toBe(secondEvent.id);
        expect(retry.id).toBe(firstEvent.id);
    });

    test("maps subscription_expired to subscription.expired", () => {
        const body = JSON.stringify({
            meta: { event_name: "subscription_expired" },
            data: {
                id: "12345",
                type: "subscriptions",
                attributes: {
                    store_id: 1,
                    customer_id: 99,
                    status: "expired",
                },
            },
        });
        const signature = sign(body, WEBHOOK_SECRET);
        const event = adapter.verifyAndParseEvent({
            rawBody: body,
            signatureHeader: signature,
        });
        expect(event.type).toBe("subscription.expired");
        expect(event.customerId).toBe("99");
        expect(event.subscriptionId).toBe("12345");
    });

    test("maps order_refunded to order.refunded", () => {
        const body = JSON.stringify({
            meta: { event_name: "order_refunded" },
            data: {
                id: "ord_77",
                type: "orders",
                attributes: {
                    store_id: 1,
                    customer_id: 99,
                    status: "refunded",
                },
            },
        });
        const signature = sign(body, WEBHOOK_SECRET);
        const event = adapter.verifyAndParseEvent({
            rawBody: body,
            signatureHeader: signature,
        });
        expect(event.type).toBe("order.refunded");
        expect(event.customerId).toBe("99");
    });

    test("maps subscription_payment_failed to payment.failed", () => {
        const body = JSON.stringify({
            meta: { event_name: "subscription_payment_failed" },
            data: {
                id: "in_2",
                type: "subscription-invoices",
                attributes: {
                    store_id: 1,
                    customer_id: 99,
                    subscription_id: 12345,
                    status: "failed",
                },
            },
        });
        const signature = sign(body, WEBHOOK_SECRET);
        const event = adapter.verifyAndParseEvent({
            rawBody: body,
            signatureHeader: signature,
        });
        expect(event.type).toBe("payment.failed");
    });

    test("unrecognised events project to unknown", () => {
        const body = JSON.stringify({
            meta: { event_name: "license_key_created" },
            data: { id: "lk_1", type: "license-keys", attributes: {} },
        });
        const signature = sign(body, WEBHOOK_SECRET);
        const event = adapter.verifyAndParseEvent({
            rawBody: body,
            signatureHeader: signature,
        });
        expect(event.type).toBe("unknown");
    });

    test("events from a different store project to unknown so they cannot mutate state", () => {
        // STORE_ID is "1". A valid signature on a body claiming store_id=4242
        // must still be neutralised by the adapter; the event is for some
        // other Bursora install (or an attacker who phished the webhook
        // secret of a different LS account).
        const body = JSON.stringify({
            meta: {
                event_name: "subscription_created",
                custom_data: { workspace_id: WORKSPACE_ID },
            },
            data: {
                id: "12345",
                type: "subscriptions",
                attributes: {
                    store_id: 4242,
                    customer_id: 99,
                    status: "active",
                },
            },
        });
        const signature = sign(body, WEBHOOK_SECRET);
        const event = adapter.verifyAndParseEvent({
            rawBody: body,
            signatureHeader: signature,
        });
        expect(event.type).toBe("unknown");
    });
});

describe("LemonSqueezyApiAdapter.verifyAndParseEvent two-secret rotation", () => {
    // Two-secret rotation: the adapter can be configured with an optional
    // `webhookSecretNext`. During a rotation window LS may send signatures
    // signed with either secret; the adapter must accept both. Outside that
    // window (next not set) behaviour is unchanged.
    const NEXT_SECRET = "ls_test_webhook_secret_next";

    const body = JSON.stringify({
        meta: {
            event_name: "subscription_created",
            custom_data: { workspace_id: WORKSPACE_ID },
        },
        data: {
            id: "12345",
            type: "subscriptions",
            attributes: { store_id: 1, customer_id: 99, status: "active" },
        },
    });

    test("accepts primary signature when only the primary secret is configured", () => {
        const adapter = new LemonSqueezyApiAdapter({
            apiKey: API_KEY,
            webhookSecret: WEBHOOK_SECRET,
            storeId: STORE_ID,
        });
        const event = adapter.verifyAndParseEvent({
            rawBody: body,
            signatureHeader: sign(body, WEBHOOK_SECRET),
        });
        expect(event.type).toBe("subscription.activated");
    });

    test("accepts a signature matching the secondary secret when both are configured", () => {
        const adapter = new LemonSqueezyApiAdapter({
            apiKey: API_KEY,
            webhookSecret: WEBHOOK_SECRET,
            webhookSecretNext: NEXT_SECRET,
            storeId: STORE_ID,
        });
        const event = adapter.verifyAndParseEvent({
            rawBody: body,
            signatureHeader: sign(body, NEXT_SECRET),
        });
        expect(event.type).toBe("subscription.activated");
    });

    test("accepts the primary signature when both secrets are configured", () => {
        const adapter = new LemonSqueezyApiAdapter({
            apiKey: API_KEY,
            webhookSecret: WEBHOOK_SECRET,
            webhookSecretNext: NEXT_SECRET,
            storeId: STORE_ID,
        });
        const event = adapter.verifyAndParseEvent({
            rawBody: body,
            signatureHeader: sign(body, WEBHOOK_SECRET),
        });
        expect(event.type).toBe("subscription.activated");
    });

    test("rejects a signature that matches neither secret", () => {
        const adapter = new LemonSqueezyApiAdapter({
            apiKey: API_KEY,
            webhookSecret: WEBHOOK_SECRET,
            webhookSecretNext: NEXT_SECRET,
            storeId: STORE_ID,
        });
        const wrong = sign(body, "some_other_secret_entirely");
        expect(() =>
            adapter.verifyAndParseEvent({
                rawBody: body,
                signatureHeader: wrong,
            }),
        ).toThrow();
    });

    test("rejects a signature signed with the next secret when next is NOT configured", () => {
        const adapter = new LemonSqueezyApiAdapter({
            apiKey: API_KEY,
            webhookSecret: WEBHOOK_SECRET,
            storeId: STORE_ID,
        });
        // Before rotation starts (no _NEXT), a signature signed with the
        // future secret must be rejected.
        expect(() =>
            adapter.verifyAndParseEvent({
                rawBody: body,
                signatureHeader: sign(body, NEXT_SECRET),
            }),
        ).toThrow();
    });
});

describe("LemonSqueezyApiAdapter.verifyCredentials", () => {
    test("GETs /v1/users/me with the bearer key and reports ok on 200", async () => {
        const { fetcher, calls } = recordingFetch([
            new Response(JSON.stringify({ data: { id: "1", type: "users", attributes: {} } }), {
                status: 200,
                headers: { "content-type": "application/vnd.api+json" },
            }),
        ]);

        const adapter = new LemonSqueezyApiAdapter({
            apiKey: API_KEY,
            webhookSecret: WEBHOOK_SECRET,
            storeId: STORE_ID,
            fetch: fetcher,
        });

        const result = await adapter.verifyCredentials();

        expect(result).toEqual({ ok: true });
        expect(calls).toHaveLength(1);
        const call = calls[0]!;
        expect(call.url).toBe("https://api.lemonsqueezy.com/v1/users/me");
        expect(call.init.method ?? "GET").toBe("GET");
        const headers = new Headers(call.init.headers);
        expect(headers.get("Authorization")).toBe(`Bearer ${API_KEY}`);
        expect(headers.get("Accept")).toBe("application/vnd.api+json");
    });

    test("reports unauthorized on a 401 rather than throwing", async () => {
        const { fetcher } = recordingFetch([
            new Response(JSON.stringify({ errors: [{ detail: "Unauthenticated." }] }), {
                status: 401,
                headers: { "content-type": "application/vnd.api+json" },
            }),
        ]);

        const adapter = new LemonSqueezyApiAdapter({
            apiKey: API_KEY,
            webhookSecret: WEBHOOK_SECRET,
            storeId: STORE_ID,
            fetch: fetcher,
        });

        const result = await adapter.verifyCredentials();

        expect(result).toEqual({ ok: false, reason: "unauthorized" });
    });

    test("treats a 403 as unauthorized too", async () => {
        const { fetcher } = recordingFetch([
            new Response(JSON.stringify({ errors: [{ detail: "Forbidden" }] }), {
                status: 403,
                headers: { "content-type": "application/vnd.api+json" },
            }),
        ]);

        const adapter = new LemonSqueezyApiAdapter({
            apiKey: API_KEY,
            webhookSecret: WEBHOOK_SECRET,
            storeId: STORE_ID,
            fetch: fetcher,
        });

        const result = await adapter.verifyCredentials();

        expect(result).toEqual({ ok: false, reason: "unauthorized" });
    });

    test("throws on a transient 5xx so a flaky LS does not look like a bad key", async () => {
        const { fetcher } = recordingFetch([
            new Response(JSON.stringify({ errors: [{ detail: "Internal error" }] }), {
                status: 500,
                headers: { "content-type": "application/vnd.api+json" },
            }),
        ]);

        const adapter = new LemonSqueezyApiAdapter({
            apiKey: API_KEY,
            webhookSecret: WEBHOOK_SECRET,
            storeId: STORE_ID,
            fetch: fetcher,
        });

        await expect(adapter.verifyCredentials()).rejects.toThrow();
    });
});
