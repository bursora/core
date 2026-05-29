/**
 * Tests for the Lemon Squeezy plan source adapter.
 *
 * The adapter fetches, per tracked product: the product (name + description),
 * its default variant (price + interval + variant id), and the store currency.
 * It parses the JSON:API payloads at the boundary and returns neutral
 * `FetchedPlan` rows. Tests inject a fake `fetch` keyed by URL — no network.
 *
 * Verified against LS test store 389222:
 *   - product 1093107 "Bursora Cloud": name, description (HTML), price 2900
 *   - variant 1712197 "Default": price 2900, interval "month", interval_count 1
 *   - store 389222: currency "USD"
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

const PRODUCT = {
    data: { id: "1093107", attributes: { name: "Bursora Cloud", description: "<p>Cloud</p>" } },
};
const VARIANT = {
    data: {
        id: "1712197",
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
    test("fetches product + default variant + store currency into a FetchedPlan", async () => {
        const { fetcher } = makeFetch({
            "/v1/products/1093107/variants": { data: [VARIANT.data] },
            "/v1/variants/1712197": VARIANT,
            "/v1/products/1093107": PRODUCT,
            "/v1/stores/389222": STORE,
        });

        const source = lemonSqueezyPlanSource({
            apiKey: "test-key",
            storeId: "389222",
            trackedProductIds: ["1093107"],
            fetch: fetcher,
        });

        const plans = await source.fetchPlans();

        expect(plans).toEqual([
            {
                lsProductId: "1093107",
                lsVariantId: "1712197",
                name: "Bursora Cloud",
                description: "<p>Cloud</p>",
                priceCents: 2900,
                currency: "USD",
                interval: "month",
                intervalCount: 1,
            },
        ]);
    });

    test("selects the published variant, ignoring a pending one that sorts first", async () => {
        // LS product 1093107 carries a pending $0.50 variant (sort 1) alongside
        // the published $29 one (sort 2); the source must pick the published.
        const pending = {
            id: "1713167",
            attributes: {
                name: "Default",
                price: 50,
                interval: "month",
                interval_count: 1,
                status: "pending",
            },
        };
        const { fetcher } = makeFetch({
            "/v1/products/1093107/variants": { data: [pending, VARIANT.data] },
            "/v1/products/1093107": PRODUCT,
            "/v1/stores/389222": STORE,
        });

        const [plan] = await lemonSqueezyPlanSource({
            apiKey: "test-key",
            storeId: "389222",
            trackedProductIds: ["1093107"],
            fetch: fetcher,
        }).fetchPlans();

        expect(plan?.lsVariantId).toBe("1712197");
        expect(plan?.priceCents).toBe(2900);
    });

    test("throws when the product has no published variant", async () => {
        const pending = {
            id: "1713167",
            attributes: {
                name: "Default",
                price: 50,
                interval: "month",
                interval_count: 1,
                status: "pending",
            },
        };
        const { fetcher } = makeFetch({
            "/v1/products/1093107/variants": { data: [pending] },
            "/v1/products/1093107": PRODUCT,
            "/v1/stores/389222": STORE,
        });

        await expect(
            lemonSqueezyPlanSource({
                apiKey: "k",
                storeId: "389222",
                trackedProductIds: ["1093107"],
                fetch: fetcher,
            }).fetchPlans(),
        ).rejects.toThrow(/no published variant/);
    });

    test("sends Bearer auth + JSON:API accept header", async () => {
        const seen: RequestInit[] = [];
        const fetcher = async (_input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
            seen.push(init ?? {});
            const url = typeof _input === "string" ? _input : _input.toString();
            if (url.includes("/variants/1712197")) return jsonResponse(VARIANT);
            if (url.includes("/products/1093107/variants")) return jsonResponse({ data: [VARIANT.data] });
            if (url.includes("/products/1093107")) return jsonResponse(PRODUCT);
            if (url.includes("/stores/389222")) return jsonResponse(STORE);
            return new Response("nope", { status: 404 });
        };

        await lemonSqueezyPlanSource({
            apiKey: "secret-key",
            storeId: "389222",
            trackedProductIds: ["1093107"],
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
            trackedProductIds: ["1093107"],
            fetch: fetcher,
        });

        await expect(source.fetchPlans()).rejects.toThrow();
    });
});
