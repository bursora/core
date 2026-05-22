/**
 * Tests for the LiteLLM pricing source adapter.
 *
 * `parseFeed` is exported for test ergonomics so we don't need to mock HTTP.
 * `fetchFeed` is exercised via fetch monkey-patching to assert non-2xx + bad
 * shape both throw and surface upward to syncPricing.
 */

import {
    fetchFeed,
    litellmPricingSource,
    parseFeed,
    type LiteLLMFeed,
} from "@/lib/metering/pricing/litellm-pricing-source.adapter";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const FIXTURE: LiteLLMFeed = {
    "gpt-4o": {
        litellm_provider: "openai",
        input_cost_per_token: 0.0000025,
        output_cost_per_token: 0.00001,
        cache_read_input_token_cost: 0.00000125,
    },
    "gpt-4o-2024-08-06": {
        litellm_provider: "openai",
        input_cost_per_token: 0.0000025,
        output_cost_per_token: 0.00001,
    },
    "claude-3-5-sonnet-20241022": {
        litellm_provider: "anthropic",
        input_cost_per_token: 0.000003,
        output_cost_per_token: 0.000015,
        cache_read_input_token_cost: 0.0000003,
    },
    "claude-3-opus": {
        litellm_provider: "anthropic",
        input_cost_per_token: 0.000015,
        output_cost_per_token: 0.000075,
    },
    "deepseek-chat": {
        litellm_provider: "deepseek",
        input_cost_per_token: 0.00000014,
        output_cost_per_token: 0.00000028,
        cache_read_input_token_cost: 0.0000000028,
    },
    "deepseek-reasoner": {
        litellm_provider: "deepseek",
        input_cost_per_token: 0.000000435,
        output_cost_per_token: 0.00000087,
        cache_read_input_token_cost: 0.000000003625,
    },
    "gemini-2.0-flash": {
        litellm_provider: "vertex_ai",
        input_cost_per_token: 0.0000001,
        output_cost_per_token: 0.0000004,
    },
    "claude-bedrock": {
        litellm_provider: "bedrock",
        input_cost_per_token: 0.000003,
        output_cost_per_token: 0.000015,
    },
    "incomplete-model": {
        litellm_provider: "openai",
    },
};

describe("litellmPricingSource", () => {
    test("identifies as the litellm source", () => {
        expect(litellmPricingSource.provider).toBe("litellm");
    });
});

describe("parseFeed", () => {
    test("only emits openai, anthropic, and deepseek rows", () => {
        const rates = parseFeed(FIXTURE);
        const providers = new Set(rates.map((r) => r.provider));

        expect(providers).toEqual(new Set(["openai", "anthropic", "deepseek"]));
        expect(rates.find((r) => r.model === "gemini-2.0-flash")).toBeUndefined();
        expect(rates.find((r) => r.model === "claude-bedrock")).toBeUndefined();
    });

    test("emits deepseek rows with cache-hit price as cachePer1mUsd", () => {
        const row = parseFeed(FIXTURE).find((r) => r.model === "deepseek-chat");

        expect(row).toEqual({
            provider: "deepseek",
            model: "deepseek-chat",
            region: "global",
            inputPer1mUsd: "0.14",
            outputPer1mUsd: "0.28",
            cachePer1mUsd: "0.0028",
        });
    });

    test("emits deepseek-reasoner row with correct math", () => {
        const row = parseFeed(FIXTURE).find((r) => r.model === "deepseek-reasoner");

        expect(row).toEqual({
            provider: "deepseek",
            model: "deepseek-reasoner",
            region: "global",
            inputPer1mUsd: "0.435",
            outputPer1mUsd: "0.87",
            cachePer1mUsd: "0.003625",
        });
    });

    test("converts per-token to per-1M for input + output", () => {
        const row = parseFeed(FIXTURE).find((r) => r.model === "gpt-4o");

        expect(row).toEqual({
            provider: "openai",
            model: "gpt-4o",
            region: "global",
            inputPer1mUsd: "2.5",
            outputPer1mUsd: "10",
            cachePer1mUsd: "1.25",
        });
    });

    test("preserves dated model keys verbatim", () => {
        const rates = parseFeed(FIXTURE);

        expect(rates.find((r) => r.model === "gpt-4o-2024-08-06")).toBeDefined();
        expect(rates.find((r) => r.model === "claude-3-5-sonnet-20241022")).toBeDefined();
    });

    test("cachePer1mUsd is null when feed omits cache_read_input_token_cost", () => {
        const row = parseFeed(FIXTURE).find((r) => r.model === "claude-3-opus");

        expect(row?.cachePer1mUsd).toBeNull();
    });

    test("drops entries missing input or output cost", () => {
        const row = parseFeed(FIXTURE).find((r) => r.model === "incomplete-model");

        expect(row).toBeUndefined();
    });

    test("converts anthropic per-token costs correctly", () => {
        const row = parseFeed(FIXTURE).find((r) => r.model === "claude-3-5-sonnet-20241022");

        expect(row).toEqual({
            provider: "anthropic",
            model: "claude-3-5-sonnet-20241022",
            region: "global",
            inputPer1mUsd: "3",
            outputPer1mUsd: "15",
            cachePer1mUsd: "0.3",
        });
    });
});

describe("fetchFeed", () => {
    const originalFetch = globalThis.fetch;
    const stub = (impl: () => Promise<Response>): void => {
        globalThis.fetch = impl as unknown as typeof fetch;
    };

    beforeEach(() => {
        globalThis.fetch = originalFetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    test("throws on non-2xx", async () => {
        stub(async () => new Response("nope", { status: 503, statusText: "Service Unavailable" }));

        await expect(fetchFeed()).rejects.toThrow(/503/);
    });

    test("throws when JSON root is not an object", async () => {
        stub(async () => new Response("null", { status: 200 }));

        await expect(fetchFeed()).rejects.toThrow(/expected JSON object/);
    });

    test("returns parsed object on 200", async () => {
        stub(
            async () =>
                new Response(JSON.stringify({ "gpt-4o": FIXTURE["gpt-4o"] }), { status: 200 }),
        );

        const feed = await fetchFeed();
        expect(feed["gpt-4o"]?.litellm_provider).toBe("openai");
    });
});
