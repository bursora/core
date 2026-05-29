/**
 * Lemon Squeezy REST adapter.
 *
 * The Bursora billing use cases depend on the neutral `PaymentProviderAdapter`
 * port. This file implements the LS half: checkout creation, portal lookup,
 * and webhook signature verification + event projection. Checkout uses the
 * flat $29/mo variant, which charges at checkout and auto-renews on LS's side;
 * Bursora records no bill of its own. LS does not ship an official Node SDK we
 * want to take a dep on, so we hit the JSON:API endpoints with the runtime
 * `fetch` directly.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
    CheckoutSessionInput,
    CheckoutSessionResult,
    PaymentProviderAdapter,
    PortalSessionInput,
    PortalSessionResult,
    VerifyCredentialsResult,
    VerifyEventInput,
    WebhookEvent,
    WebhookEventType,
} from "./payment-provider.adapter";

const LS_API_BASE = "https://api.lemonsqueezy.com";
const JSON_API_CONTENT_TYPE = "application/vnd.api+json";

/**
 * Minimal fetcher shape the adapter depends on. Avoids capturing Bun-specific
 * properties (`preconnect`, etc.) from the global `typeof fetch` so tests can
 * pass a plain stub without having to satisfy unrelated platform extensions.
 */
export type LemonSqueezyFetcher = (
    input: URL | RequestInfo,
    init?: RequestInit,
) => Promise<Response>;

export interface LemonSqueezyApiAdapterConfig {
    readonly apiKey: string;
    readonly webhookSecret: string;
    /**
     * Optional second webhook secret. When present, `verifyAndParseEvent`
     * accepts signatures matching either secret. Used for zero-downtime
     * webhook-secret rotation: operators add the new secret here, rotate at
     * Lemon Squeezy, then promote `_NEXT` to the primary slot and clear this.
     */
    readonly webhookSecretNext?: string;
    readonly storeId: string;
    /** Injected for tests. Defaults to the runtime global `fetch`. */
    readonly fetch?: LemonSqueezyFetcher;
}

export class LemonSqueezyApiAdapter implements PaymentProviderAdapter {
    private readonly apiKey: string;
    private readonly webhookSecret: string;
    private readonly webhookSecretNext: string;
    private readonly storeId: string;
    private readonly fetcher: LemonSqueezyFetcher;

    constructor(config: LemonSqueezyApiAdapterConfig) {
        this.apiKey = config.apiKey;
        this.webhookSecret = config.webhookSecret;
        this.webhookSecretNext = config.webhookSecretNext ?? "";
        this.storeId = config.storeId;
        this.fetcher = config.fetch ?? ((input, init) => fetch(input, init));
    }

    async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
        const body = {
            data: {
                type: "checkouts",
                attributes: {
                    checkout_data: {
                        email: input.userEmail,
                        custom: { workspace_id: input.workspaceId },
                    },
                    product_options: {
                        redirect_url: input.successUrl,
                    },
                },
                relationships: {
                    store: { data: { type: "stores", id: this.storeId } },
                    variant: { data: { type: "variants", id: input.variantId } },
                },
            },
        };

        const response = await this.fetcher(`${LS_API_BASE}/v1/checkouts`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                Accept: JSON_API_CONTENT_TYPE,
                "Content-Type": JSON_API_CONTENT_TYPE,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(
                `lemonsqueezy.createCheckoutSession failed: ${response.status} ${errorText}`,
            );
        }

        const payload = (await response.json()) as {
            data: { id: string; attributes: { url: string } };
        };
        const url = payload.data?.attributes?.url;
        if (!url) {
            throw new Error("lemonsqueezy.createCheckoutSession returned no url");
        }
        return { id: payload.data.id, url };
    }

    async createPortalSession(input: PortalSessionInput): Promise<PortalSessionResult> {
        // LS does not mint short-lived portal sessions on demand; instead each
        // customer record carries a long-lived signed `customer_portal` URL on
        // `data.attributes.urls`. We fetch the customer and surface that URL.
        const response = await this.fetcher(
            `${LS_API_BASE}/v1/customers/${encodeURIComponent(input.customerId)}`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    Accept: JSON_API_CONTENT_TYPE,
                },
            },
        );

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(
                `lemonsqueezy.createPortalSession failed: ${response.status} ${errorText}`,
            );
        }

        const payload = (await response.json()) as {
            data?: { attributes?: { urls?: { customer_portal?: string } } };
        };
        const url = payload.data?.attributes?.urls?.customer_portal;
        if (!url) {
            throw new Error("lemonsqueezy.createPortalSession returned no customer_portal url");
        }
        return { url };
    }

    verifyAndParseEvent(input: VerifyEventInput): WebhookEvent {
        if (input.signatureHeader.length === 0) {
            throw new Error("lemonsqueezy.verifyAndParseEvent: missing signature header");
        }
        const provided = input.signatureHeader.trim();

        // Accept a signature matching either the primary secret or, if set, the
        // rotation secret. Per-comparison constant time is preserved via
        // `timingSafeEqual`; the OR is fine because the secret set is fixed
        // per call and an attacker controls only the (rawBody, signature).
        const verified =
            this.matchesSecret(input.rawBody, provided, this.webhookSecret) ||
            (this.webhookSecretNext.length > 0 &&
                this.matchesSecret(input.rawBody, provided, this.webhookSecretNext));
        if (!verified) {
            throw new Error("lemonsqueezy.verifyAndParseEvent: signature mismatch");
        }
        return mapLemonSqueezyEvent(
            JSON.parse(input.rawBody) as LemonSqueezyWebhookPayload,
            this.storeId,
        );
    }

    private matchesSecret(rawBody: string, provided: string, secret: string): boolean {
        const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
        // `timingSafeEqual` requires equal-length buffers. Hex digests for a
        // given hash are fixed-length, so a length mismatch reveals nothing
        // beyond what the attacker already knows from their own input length.
        if (provided.length !== expected.length) return false;
        return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
    }

    async verifyCredentials(): Promise<VerifyCredentialsResult> {
        // `/v1/users/me` is the cheapest authenticated read: it touches no
        // store data and exists on every LS account. A 401/403 means the key
        // is dead; any other non-2xx is a transient upstream issue we surface
        // as a throw so a flaky LS is not mistaken for a rotated key.
        const response = await this.fetcher(`${LS_API_BASE}/v1/users/me`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                Accept: JSON_API_CONTENT_TYPE,
            },
        });
        if (response.ok) return { ok: true };
        if (response.status === 401 || response.status === 403) {
            return { ok: false, reason: "unauthorized" };
        }
        const errorText = await response.text().catch(() => "");
        throw new Error(`lemonsqueezy.verifyCredentials failed: ${response.status} ${errorText}`);
    }
}

interface LemonSqueezyWebhookPayload {
    readonly meta?: {
        readonly event_name?: string;
        readonly custom_data?: Record<string, unknown>;
        readonly webhook_id?: string;
    };
    readonly data?: {
        readonly id?: string | number;
        readonly type?: string;
        readonly attributes?: Record<string, unknown>;
    };
}

/**
 * Project a Lemon Squeezy webhook payload onto the neutral `WebhookEvent`
 * shape. Exported so projection can be unit-tested without the HMAC path.
 *
 * LS does not ship a stable per-event id in `meta`; we synthesise one from
 * the LS-supplied `webhook_id` when present, falling back to a composite of
 * event name + data id. The Bursora webhook store uses this as the
 * idempotency key, so it must be stable across LS retries of the same
 * logical delivery.
 *
 * Events whose `attributes.store_id` does not match the configured store
 * project to `unknown`. This neutralises payloads from a different LS store
 * (foreign account, misconfigured webhook) even when the signature verifies.
 */
export function mapLemonSqueezyEvent(
    payload: LemonSqueezyWebhookPayload,
    expectedStoreId: string,
): WebhookEvent {
    const eventName = payload.meta?.event_name ?? "";
    const dataId = payload.data?.id !== undefined ? String(payload.data.id) : "";
    const workspaceId =
        typeof payload.meta?.custom_data?.workspace_id === "string"
            ? (payload.meta.custom_data.workspace_id as string)
            : null;
    const attributes = payload.data?.attributes ?? {};

    // LS sends no per-delivery id. For `subscriptions` events `dataId` is the
    // stable subscription id, so `${eventName}:${dataId}` collides across
    // distinct status changes; mixing in `updated_at` separates them while a
    // true retry (identical payload) still dedupes.
    const updatedAtSuffix =
        typeof attributes.updated_at === "string" ? `:${attributes.updated_at}` : "";
    const eventId = payload.meta?.webhook_id ?? `${eventName}:${dataId}${updatedAtSuffix}`;
    const customerId =
        attributes.customer_id !== undefined && attributes.customer_id !== null
            ? String(attributes.customer_id)
            : null;
    const status = typeof attributes.status === "string" ? attributes.status : null;

    const subscriptionType = payload.data?.type === "subscriptions";
    const subscriptionId = subscriptionType
        ? dataId
        : attributes.subscription_id !== undefined && attributes.subscription_id !== null
          ? String(attributes.subscription_id)
          : null;
    const invoiceId = !subscriptionType && dataId !== "" ? dataId : null;

    const storeIdAttr = attributes.store_id;
    const storeMatches =
        storeIdAttr !== undefined &&
        storeIdAttr !== null &&
        String(storeIdAttr) === expectedStoreId;
    const type = storeMatches ? eventNameToWebhookType(eventName) : "unknown";

    return {
        id: eventId,
        type,
        workspaceId,
        customerId,
        subscriptionId,
        status,
        ...(invoiceId !== null ? { invoiceId } : {}),
    };
}

function eventNameToWebhookType(eventName: string): WebhookEventType {
    switch (eventName) {
        case "subscription_created":
        case "subscription_resumed":
        case "subscription_unpaused":
            return "subscription.activated";
        case "subscription_payment_success":
            // Recurring-renewal signal. The customer paid; the handler clears
            // past_due → active. First-checkout activation rides on
            // `subscription_created` instead.
            return "payment.succeeded";
        case "subscription_updated":
        case "subscription_paused":
            return "subscription.updated";
        case "subscription_cancelled":
            return "subscription.canceled";
        case "subscription_expired":
            return "subscription.expired";
        case "subscription_payment_failed":
            return "payment.failed";
        case "subscription_payment_refunded":
        case "order_refunded":
            return "order.refunded";
        default:
            return "unknown";
    }
}
