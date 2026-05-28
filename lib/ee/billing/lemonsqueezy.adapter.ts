/**
 * Lemon Squeezy REST adapter.
 *
 * The Bursora billing use cases depend on the neutral `PaymentProviderAdapter`
 * port. This file implements the LS half: checkout creation, portal lookup,
 * webhook signature verification + event projection, monthly usage reporting
 * against the metered subscription item, plus the refund-all + end-of-period
 * cancellation path that backs the money-back guarantee. LS cancels at the
 * end of the current billing period (no immediate-cancel primitive); the
 * rollup cron skips `canceled`/`expired` workspaces so no usage is reported
 * after a refund. LS does not ship an official Node SDK we want to take a
 * dep on, so we hit the JSON:API endpoints with the runtime `fetch` directly.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
    CheckoutSessionInput,
    CheckoutSessionResult,
    PaymentProviderAdapter,
    PortalSessionInput,
    PortalSessionResult,
    RefundAllOrdersInput,
    RefundAllOrdersResult,
    ReportUsageInput,
    ReportUsageResult,
    VerifyCredentialsResult,
    VerifyEventInput,
    WebhookEvent,
    WebhookEventType,
} from "./payment-provider.adapter";

const LS_API_BASE = "https://api.lemonsqueezy.com";
const JSON_API_CONTENT_TYPE = "application/vnd.api+json";

// LS rejects a per-unit price below $0.50 in the dashboard, and usage-record
// quantities must be integers. So 1 unit = $0.50 = 50 cents: we report
// `round(totalCents / 50)` units, and LS bills `units × $0.50`. This rounds
// the monthly charge to the nearest half-dollar — only bills strictly between
// the $29 floor and $499 cap are affected (both are exact multiples of $0.50).
// Revert to 1 (cent-exact) if LS enables a $0.01 unit price.
const USAGE_UNIT_CENTS = 50;

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

    async reportUsage(input: ReportUsageInput): Promise<ReportUsageResult> {
        // LS attaches usage records to a *subscription item* (the metered
        // variant line on the subscription), not the subscription itself.
        // Fetch the subscription so we can resolve the first item id.
        const subscriptionResponse = await this.fetcher(
            `${LS_API_BASE}/v1/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    Accept: JSON_API_CONTENT_TYPE,
                },
            },
        );
        if (!subscriptionResponse.ok) {
            const errorText = await subscriptionResponse.text().catch(() => "");
            throw new Error(
                `lemonsqueezy.reportUsage subscription lookup failed: ${subscriptionResponse.status} ${errorText}`,
            );
        }
        const subscriptionPayload = (await subscriptionResponse.json()) as {
            data?: {
                relationships?: {
                    "subscription-items"?: { data?: ReadonlyArray<{ id?: string | number }> };
                };
            };
        };
        const itemId =
            subscriptionPayload.data?.relationships?.["subscription-items"]?.data?.[0]?.id;
        if (itemId === undefined || itemId === null || String(itemId).length === 0) {
            throw new Error(
                `lemonsqueezy.reportUsage: subscription ${input.subscriptionId} has no subscription-item`,
            );
        }

        // Idempotency: LS does not formally document an idempotency-key header
        // on `/v1/usage-records`, but it accepts and ignores unknown headers.
        // We send `Idempotency-Key` derived from (subscriptionId, periodMonth)
        // so any retry of the same period carries a stable token; if LS adds
        // first-class support later this just starts working. The primary
        // dedup guard is application-side via `lastBilledMonth` on the
        // workspace row (see `reportUsageUseCase`).
        const idempotencyKey = `bursora:usage:${input.subscriptionId}:${input.periodMonth}`;

        const quantity = Math.round(input.totalCents / USAGE_UNIT_CENTS);

        const body = {
            data: {
                type: "usage-records",
                attributes: { quantity },
                relationships: {
                    "subscription-item": {
                        data: { type: "subscription-items", id: String(itemId) },
                    },
                },
            },
        };

        const response = await this.fetcher(`${LS_API_BASE}/v1/usage-records`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                Accept: JSON_API_CONTENT_TYPE,
                "Content-Type": JSON_API_CONTENT_TYPE,
                "Idempotency-Key": idempotencyKey,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(`lemonsqueezy.reportUsage failed: ${response.status} ${errorText}`);
        }

        const payload = (await response.json()) as { data?: { id?: string | number } };
        const id = payload.data?.id;
        if (id === undefined || id === null || String(id).length === 0) {
            throw new Error("lemonsqueezy.reportUsage returned no usage-record id");
        }
        return { usageRecordId: String(id) };
    }

    async refundAllOrders(input: RefundAllOrdersInput): Promise<RefundAllOrdersResult> {
        // Filter by `customer_id` so two LS customers sharing an email cannot
        // bleed orders across workspaces. As a belt-and-suspenders guard we
        // also drop any row whose `attributes.customer_id` mismatches before
        // issuing a refund. Listing all pages before issuing refunds keeps the
        // LS retry semantics simple: a refund failure surfaces immediately and
        // the caller can replay because already-refunded orders are skipped on
        // retry.
        // A non-numeric customer id makes every comparison below true
        // (NaN !== anything), silently skipping all refunds. Fail loud first.
        const expectedCustomerId = Number(input.customerId);
        if (!Number.isFinite(expectedCustomerId)) {
            throw new Error(
                `lemonsqueezy.refundAllOrders: non-numeric customerId ${JSON.stringify(input.customerId)}`,
            );
        }

        const firstUrl =
            `${LS_API_BASE}/v1/orders?filter%5Bstore_id%5D=${encodeURIComponent(this.storeId)}` +
            `&filter%5Bcustomer_id%5D=${encodeURIComponent(input.customerId)}`;

        const orders = await this.listAllOrders(firstUrl);

        const refundedOrderIds: string[] = [];
        let totalCents = 0;
        for (const order of orders) {
            if (order.status !== "paid") continue;
            if (order.customerId !== expectedCustomerId) continue;
            const refunded = await this.refundOrder(order.id);
            refundedOrderIds.push(refunded.id);
            totalCents += refunded.totalCents;
        }

        return { refundedOrderIds, totalCents };
    }

    private async listAllOrders(
        startUrl: string,
    ): Promise<Array<{ id: string; status: string; totalCents: number; customerId: number }>> {
        const orders: Array<{
            id: string;
            status: string;
            totalCents: number;
            customerId: number;
        }> = [];
        let nextUrl: string | null = startUrl;
        while (nextUrl !== null) {
            const response = await this.fetcher(nextUrl, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    Accept: JSON_API_CONTENT_TYPE,
                },
            });
            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                throw new Error(
                    `lemonsqueezy.refundAllOrders list failed: ${response.status} ${errorText}`,
                );
            }
            const payload = (await response.json()) as LemonSqueezyOrdersPage;
            const rows = payload.data ?? [];
            for (const row of rows) {
                if (row.id === undefined || row.id === null) continue;
                const attrs = row.attributes ?? {};
                const status = typeof attrs.status === "string" ? attrs.status : "";
                const total = typeof attrs.total === "number" ? attrs.total : 0;
                const customerId =
                    typeof attrs.customer_id === "number" ? attrs.customer_id : Number.NaN;
                orders.push({ id: String(row.id), status, totalCents: total, customerId });
            }
            const next = payload.links?.next;
            nextUrl = typeof next === "string" && next.length > 0 ? next : null;
        }
        return orders;
    }

    private async refundOrder(orderId: string): Promise<{ id: string; totalCents: number }> {
        const response = await this.fetcher(
            `${LS_API_BASE}/v1/orders/${encodeURIComponent(orderId)}/refund`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    Accept: JSON_API_CONTENT_TYPE,
                    "Content-Type": JSON_API_CONTENT_TYPE,
                },
            },
        );
        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(
                `lemonsqueezy.refundAllOrders refund failed for order ${orderId}: ${response.status} ${errorText}`,
            );
        }
        const payload = (await response.json()) as {
            data?: { id?: string | number; attributes?: { total?: number } };
        };
        const id = payload.data?.id !== undefined ? String(payload.data.id) : orderId;
        const total = payload.data?.attributes?.total ?? 0;
        return { id, totalCents: total };
    }

    async cancelSubscription(input: { subscriptionId: string }): Promise<void> {
        const response = await this.fetcher(
            `${LS_API_BASE}/v1/subscriptions/${encodeURIComponent(input.subscriptionId)}`,
            {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    Accept: JSON_API_CONTENT_TYPE,
                },
            },
        );
        if (response.ok) return;
        // Idempotency: a 404 means the subscription is already gone, and LS
        // returns a 4xx like 422 with a body that explicitly says the
        // subscription is already cancelled. Both branches are safe no-ops
        // because the desired state is "cancelled".
        if (response.status === 404) return;
        const errorText = await response.text().catch(() => "");
        if (
            response.status >= 400 &&
            response.status < 500 &&
            /already\s*cancell?ed/i.test(errorText)
        ) {
            return;
        }
        throw new Error(`lemonsqueezy.cancelSubscription failed: ${response.status} ${errorText}`);
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

interface LemonSqueezyOrdersPage {
    readonly data?: ReadonlyArray<{
        readonly id?: string | number;
        readonly attributes?: {
            readonly status?: string;
            readonly total?: number;
            readonly customer_id?: number;
        };
    }>;
    readonly links?: { readonly next?: string | null };
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

    // LS stamps `trial_ends_at` as an ISO 8601 string on subscription
    // objects with a trial period. Parse it into a Date so downstream
    // billing code can compare against `now` without re-parsing.
    const trialEndsAt = parseTrialEndsAt(attributes.trial_ends_at);

    return {
        id: eventId,
        type,
        workspaceId,
        customerId,
        subscriptionId,
        status,
        trialEndsAt,
        ...(invoiceId !== null ? { invoiceId } : {}),
    };
}

// LS stamps `trial_ends_at` as an ISO 8601 string on subscription objects
// with a trial period. Parse into a Date so downstream billing can compare
// against `now` without re-parsing. An unparseable value yields Invalid Date,
// whose getTime() is NaN; is-billable-now's `NaN <= now` is false, which would
// pin a trialing workspace as permanently non-billable. Reject it to null.
function parseTrialEndsAt(attr: unknown): Date | null {
    if (typeof attr !== "string" || attr.length === 0) return null;
    const d = new Date(attr);
    return Number.isNaN(d.getTime()) ? null : d;
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
