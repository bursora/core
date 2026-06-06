/**
 * Tests for the Lemon Squeezy plan source adapter.
 *
 * The adapter lists the store's products, matches each tracked plan by product
 * name (the only identifier stable across LS test and live modes), then reads
 * its published variant (price + interval + variant id) and the store currency.
 * It parses the JSON:API payloads at the boundary and returns neutral
 * `FetchedPlan` rows. Tests inject a fake `fetch` keyed by URL — no network.
 *
 * Fixtures use the live product id 1101649 while tracking by name to prove the
 * adapter resolves whatever id LS returns and never assumes a hardcoded one.
 */

import { lemonSqueezyPlanSource } from "@/drizzle/plan-sync/lemonsqueezy-plan-source";
import { describe, expect, test } from "bun:test";

const jsonResponse = (body: unknown): Response =>
    new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/vnd.api+json" },
    });

// Routes a fake fetch by pathname so each LS endpoint returns its fixture.
const makeFetch = (routes: Record<string, unknown>) => {
    const calls: string[] = [];
    const fetcher = async (input: URL | RequestInfo): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString();
        calls.push(url);
        for (const [path, body] of Object.entries(routes)) {
            if (url.includes(path)) return jsonResponse(body);
        }
        return new Response("not found", { status: 404 });
    };
    return { fetcher, calls };
};

const PRODUCTS = {
    data: [{ id: "1101649", attributes: { name: "Bursora Cloud", description: "<p>Cloud</p>" } }],
};
const VARIANT = {
    data: {
        id: "1725367",
        attributes: {
            name: "Default",
            price: 2900,
            interval: "month",
            interval_count: 1,
            status: "published",
        },
    },
};
const STORE = { data: { id: "389222", attributes: { currency: "USD" } } };

describe("lemonSqueezyPlanSource", () => {
    test("resolves the product by name and returns its published variant", async () => {
        const { fetcher } = makeFetch({
            "/v1/products/1101649/variants": { data: [VARIANT.data] },
            "/v1/products?filter": PRODUCTS,
            "/v1/stores/389222": STORE,
        });

        const source = lemonSqueezyPlanSource({
            apiKey: "test-key",
            storeId: "389222",
            trackedProductNames: ["Bursora Cloud"],
            fetch: fetcher,
        });

        const plans = await source.fetchPlans();

        expect(plans).toEqual([
            {
                lsProductId: "1101649",
                lsVariantId: "1725367",
                name: "Bursora Cloud",
                description: "<p>Cloud</p>",
                priceCents: 2900,
                currency: "USD",
                interval: "month",
                intervalCount: 1,
            },
        ]);
    });

    test("returns one plan per published variant (monthly + annual)", async () => {
        // The cloud product carries two published variants: monthly $29 and
        // annual $290 (2 months free). The source must emit a FetchedPlan for
        // each so the plans table carries both billing intervals.
        const annual = {
            id: "1725999",
            attributes: {
                name: "Annual",
                price: 29000,
                interval: "year",
                interval_count: 1,
                status: "published",
            },
        };
        const { fetcher } = makeFetch({
            "/v1/products/1101649/variants": { data: [VARIANT.data, annual] },
            "/v1/products?filter": PRODUCTS,
            "/v1/stores/389222": STORE,
        });

        const plans = await lemonSqueezyPlanSource({
            apiKey: "test-key",
            storeId: "389222",
            trackedProductNames: ["Bursora Cloud"],
            fetch: fetcher,
        }).fetchPlans();

        expect(plans).toEqual([
            {
                lsProductId: "1101649",
                lsVariantId: "1725367",
                name: "Bursora Cloud",
                description: "<p>Cloud</p>",
                priceCents: 2900,
                currency: "USD",
                interval: "month",
                intervalCount: 1,
            },
            {
                lsProductId: "1101649",
                lsVariantId: "1725999",
                name: "Bursora Cloud",
                description: "<p>Cloud</p>",
                priceCents: 29000,
                currency: "USD",
                interval: "year",
                intervalCount: 1,
            },
        ]);
    });

    test("dedups two published variants of the same interval, keeping the higher price", async () => {
        // A superseded $0.50 monthly variant left in `published` status alongside
        // the live $29 monthly one. Both are published, so a naive keep-all would
        // emit two monthly rows and let checkout's interval `.find()` resolve the
        // stale cheaper price. The source must keep only the higher-priced one.
        const stale = {
            id: "1725000",
            attributes: {
                name: "Default (old)",
                price: 50,
                interval: "month",
                interval_count: 1,
                status: "published",
            },
        };
        const { fetcher } = makeFetch({
            "/v1/products/1101649/variants": { data: [stale, VARIANT.data] },
            "/v1/products?filter": PRODUCTS,
            "/v1/stores/389222": STORE,
        });

        const plans = await lemonSqueezyPlanSource({
            apiKey: "test-key",
            storeId: "389222",
            trackedProductNames: ["Bursora Cloud"],
            fetch: fetcher,
        }).fetchPlans();

        expect(plans).toHaveLength(1);
        expect(plans[0]?.lsVariantId).toBe("1725367");
        expect(plans[0]?.priceCents).toBe(2900);
    });

    test("selects the published variant, ignoring a pending one that sorts first", async () => {
        // The product carries a pending $0.50 variant (sort 1) alongside the
        // published $29 one (sort 2); the source must pick the published.
        const pending = {
            id: "1725366",
            attributes: {
                name: "Default",
                price: 50,
                interval: "month",
                interval_count: 1,
                status: "pending",
            },
        };
        const { fetcher } = makeFetch({
            "/v1/products/1101649/variants": { data: [pending, VARIANT.data] },
            "/v1/products?filter": PRODUCTS,
            "/v1/stores/389222": STORE,
        });

        const [plan] = await lemonSqueezyPlanSource({
            apiKey: "test-key",
            storeId: "389222",
            trackedProductNames: ["Bursora Cloud"],
            fetch: fetcher,
        }).fetchPlans();

        expect(plan?.lsVariantId).toBe("1725367");
        expect(plan?.priceCents).toBe(2900);
    });

    test("throws when the product has no published variant", async () => {
        const pending = {
            id: "1725366",
            attributes: {
                name: "Default",
                price: 50,
                interval: "month",
                interval_count: 1,
                status: "pending",
            },
        };
        const { fetcher } = makeFetch({
            "/v1/products/1101649/variants": { data: [pending] },
            "/v1/products?filter": PRODUCTS,
            "/v1/stores/389222": STORE,
        });

        await expect(
            lemonSqueezyPlanSource({
                apiKey: "k",
                storeId: "389222",
                trackedProductNames: ["Bursora Cloud"],
                fetch: fetcher,
            }).fetchPlans(),
        ).rejects.toThrow(/no published variant/);
    });

    test("throws when no product matches the tracked name", async () => {
        const { fetcher } = makeFetch({
            "/v1/products?filter": PRODUCTS,
            "/v1/stores/389222": STORE,
        });

        await expect(
            lemonSqueezyPlanSource({
                apiKey: "k",
                storeId: "389222",
                trackedProductNames: ["Nonexistent Plan"],
                fetch: fetcher,
            }).fetchPlans(),
        ).rejects.toThrow(/no product named "Nonexistent Plan"/);
    });

    test("sends Bearer auth + JSON:API accept header", async () => {
        const seen: RequestInit[] = [];
        const fetcher = async (
            _input: URL | RequestInfo,
            init?: RequestInit,
        ): Promise<Response> => {
            seen.push(init ?? {});
            const url = typeof _input === "string" ? _input : _input.toString();
            if (url.includes("/products/1101649/variants"))
                return jsonResponse({ data: [VARIANT.data] });
            if (url.includes("/products?filter")) return jsonResponse(PRODUCTS);
            if (url.includes("/stores/389222")) return jsonResponse(STORE);
            return new Response("nope", { status: 404 });
        };

        await lemonSqueezyPlanSource({
            apiKey: "secret-key",
            storeId: "389222",
            trackedProductNames: ["Bursora Cloud"],
            fetch: fetcher,
        }).fetchPlans();

        const headers = seen[0]?.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer secret-key");
        expect(headers.Accept).toBe("application/vnd.api+json");
    });

    test("throws on a non-2xx LS response", async () => {
        const fetcher = async (): Promise<Response> => new Response("boom", { status: 500 });

        const source = lemonSqueezyPlanSource({
            apiKey: "k",
            storeId: "389222",
            trackedProductNames: ["Bursora Cloud"],
            fetch: fetcher,
        });

        await expect(source.fetchPlans()).rejects.toThrow();
    });
});
