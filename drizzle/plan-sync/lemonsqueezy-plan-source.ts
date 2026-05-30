/**
 * Lemon Squeezy plan source — seed-only.
 *
 * Implements the `PlanSource` port by hitting the LS JSON:API. Lists the store's
 * products and matches each tracked plan by product name — the only identifier
 * stable across LS test and live modes (product id and slug both differ per
 * mode). For each match it reads name + description, the product's published
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
    readonly trackedProductNames: readonly string[];
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
            const productsByName = parseProductList(
                await get(`/v1/products?filter[store_id]=${config.storeId}&page[size]=100`),
            );
            const plans: FetchedPlan[] = [];
            for (const name of config.trackedProductNames) {
                const product = productsByName.get(name);
                if (product === undefined) {
                    throw new Error(
                        `lemonsqueezy plan source: no product named "${name}" in store ${config.storeId}`,
                    );
                }
                const variant = parseVariant(await get(`/v1/products/${product.id}/variants`));
                plans.push({
                    lsProductId: product.id,
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

interface ParsedProduct {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
}

function parseProductList(payload: unknown): Map<string, ParsedProduct> {
    const data = asRecord(payload, "products").data;
    if (!Array.isArray(data)) {
        throw new Error("lemonsqueezy plan source: expected array for products.data");
    }
    const byName = new Map<string, ParsedProduct>();
    for (const entry of data) {
        const product = asRecord(entry, "product");
        const attrs = asRecord(product.attributes, "product.attributes");
        const name = requireString(attrs.name, "product name");
        byName.set(name, {
            id: requireString(product.id, "product id"),
            name,
            description: typeof attrs.description === "string" ? attrs.description : null,
        });
    }
    return byName;
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
