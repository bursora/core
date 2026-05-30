/**
 * Lemon Squeezy plan source — seed-only.
 *
 * Implements the `PlanSource` port by hitting the LS JSON:API. For each tracked
 * product it reads the product (name + description), the product's published
 * variant (price + interval + interval_count + variant id), and the store
 * currency. Returns neutral `FetchedPlan` rows the sync use case upserts.
 *
 * Lives under `drizzle/` so this LS-calling code is NEVER statically imported
 * by a bundled module — the OSS Next build excludes it. Mirrors the auth +
 * content-type + injectable-fetch shape of `lib/ee/billing/lemonsqueezy.adapter`
 * so tests pass a plain `fetch` stub.
 */

import type { FetchedPlan, PlanSource } from "@/lib/plans/plan-source";

const LS_API_BASE = "https://api.lemonsqueezy.com";
const JSON_API_CONTENT_TYPE = "application/vnd.api+json";

export type LemonSqueezyFetcher = (
    input: URL | RequestInfo,
    init?: RequestInit,
) => Promise<Response>;

export interface LemonSqueezyPlanSourceConfig {
    readonly apiKey: string;
    readonly storeId: string;
    readonly trackedProductIds: readonly string[];
    /** Injected for tests. Defaults to the runtime global `fetch`. */
    readonly fetch?: LemonSqueezyFetcher;
}

export function lemonSqueezyPlanSource(config: LemonSqueezyPlanSourceConfig): PlanSource {
    const fetcher: LemonSqueezyFetcher = config.fetch ?? ((input, init) => fetch(input, init));

    const get = async (path: string): Promise<unknown> => {
        const response = await fetcher(`${LS_API_BASE}${path}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                Accept: JSON_API_CONTENT_TYPE,
            },
        });
        if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            throw new Error(
                `lemonsqueezy plan source ${path} failed: ${response.status} ${errorText}`,
            );
        }
        return response.json();
    };

    return {
        fetchPlans: async () => {
            const currency = parseCurrency(await get(`/v1/stores/${config.storeId}`));
            const plans: FetchedPlan[] = [];
            for (const productId of config.trackedProductIds) {
                const product = parseProduct(await get(`/v1/products/${productId}`));
                const variant = parseVariant(await get(`/v1/products/${productId}/variants`));
                plans.push({
                    lsProductId: productId,
                    lsVariantId: variant.id,
                    name: product.name,
                    description: product.description,
                    priceCents: variant.priceCents,
                    currency,
                    interval: variant.interval,
                    intervalCount: variant.intervalCount,
                });
            }
            return plans;
        },
    };
}

// --- boundary parsing --------------------------------------------------------
// Narrow `unknown` into the few fields we read. Any missing/mistyped field
// throws so a malformed LS payload fails the seed loudly instead of writing a
// half-populated plan row.

function asRecord(value: unknown, context: string): Record<string, unknown> {
    if (value === null || typeof value !== "object") {
        throw new Error(`lemonsqueezy plan source: expected object for ${context}`);
    }
    return value as Record<string, unknown>;
}

function attributesOf(payload: unknown, context: string): Record<string, unknown> {
    const data = asRecord(asRecord(payload, context).data, `${context}.data`);
    return asRecord(data.attributes, `${context}.data.attributes`);
}

function requireString(value: unknown, context: string): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`lemonsqueezy plan source: expected non-empty string for ${context}`);
    }
    return value;
}

function requireInteger(value: unknown, context: string): number {
    if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new Error(`lemonsqueezy plan source: expected integer for ${context}`);
    }
    return value;
}

function parseCurrency(payload: unknown): string {
    return requireString(attributesOf(payload, "store").currency, "store currency");
}

function parseProduct(payload: unknown): { name: string; description: string | null } {
    const attrs = attributesOf(payload, "product");
    return {
        name: requireString(attrs.name, "product name"),
        description: typeof attrs.description === "string" ? attrs.description : null,
    };
}

function parseVariant(payload: unknown): {
    id: string;
    priceCents: number;
    interval: string;
    intervalCount: number;
} {
    const data = asRecord(payload, "variants").data;
    if (!Array.isArray(data) || data.length === 0) {
        throw new Error("lemonsqueezy plan source: product has no variants");
    }
    // A product can carry pending/draft variants alongside the live one (e.g. a
    // superseded price). Only a published variant is sellable, so select that
    // one rather than the first in sort order.
    const published = data.find(
        (v) =>
            asRecord(asRecord(v, "variant").attributes, "variant.attributes").status ===
            "published",
    );
    if (published === undefined) {
        throw new Error("lemonsqueezy plan source: product has no published variant");
    }
    const variant = asRecord(published, "published variant");
    const attrs = asRecord(variant.attributes, "published variant.attributes");
    return {
        id: requireString(variant.id, "variant id"),
        priceCents: requireInteger(attrs.price, "variant price"),
        interval: requireString(attrs.interval, "variant interval"),
        intervalCount: requireInteger(attrs.interval_count, "variant interval_count"),
    };
}
