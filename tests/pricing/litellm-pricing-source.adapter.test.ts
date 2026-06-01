/**
 * Tests for the LiteLLM pricing source adapter.
 *
 * `parseFeed` is exported for test ergonomics so we don't need to mock HTTP.
 * `fetchFeed` is exercised via fetch monkey-patching to assert non-2xx + bad
 * shape both throw and surface upward to syncPricing.
 */

import { findPricingRow } from "@/lib/metering/pricing/find-pricing-row";
import {
    fetchFeed,
    litellmPricingSource,
    parseFeed,
    type LiteLLMFeed,
} from "@/lib/metering/pricing/litellm-pricing-source.adapter";
import type { PricingRow } from "@/lib/metering/pricing/pricing-row";
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

// LiteLLM namespaces these vendors as `${provider}/<id>`, but the SDK reports
// the bare id the vendor's API takes. Each case pairs the LiteLLM feed key with
// the (provider, model) an event actually carries — the row must match it.
const VENDOR_CASES = [
    {
        feedKey: "gemini/gemini-2.0-flash",
        litellmProvider: "gemini",
        provider: "google",
        eventModel: "gemini-2.0-flash",
    },
    {
        feedKey: "groq/llama-3.1-8b-instant",
        litellmProvider: "groq",
        provider: "groq",
        eventModel: "llama-3.1-8b-instant",
    },
    {
        feedKey: "groq/meta-llama/llama-guard-4-12b",
        litellmProvider: "groq",
        provider: "groq",
        eventModel: "meta-llama/llama-guard-4-12b",
    },
    { feedKey: "xai/grok-2", litellmProvider: "xai", provider: "xai", eventModel: "grok-2" },
    {
        feedKey: "mistral/codestral-2405",
        litellmProvider: "mistral",
        provider: "mistral",
        eventModel: "codestral-2405",
    },
    {
        feedKey: "together_ai/baai/bge-base-en-v1.5",
        litellmProvider: "together_ai",
        provider: "together",
        eventModel: "baai/bge-base-en-v1.5",
    },
    {
        feedKey: "fireworks_ai/accounts/fireworks/models/deepseek-r1",
        litellmProvider: "fireworks_ai",
        provider: "fireworks",
        eventModel: "accounts/fireworks/models/deepseek-r1",
    },
    {
        feedKey: "perplexity/llama-3.1-8b-instruct",
        litellmProvider: "perplexity",
        provider: "perplexity",
        eventModel: "llama-3.1-8b-instruct",
    },
    {
        feedKey: "openrouter/anthropic/claude-3.5-sonnet",
        litellmProvider: "openrouter",
        provider: "openrouter",
        eventModel: "anthropic/claude-3.5-sonnet",
    },
    {
        feedKey: "vercel_ai_gateway/openai/gpt-4o",
        litellmProvider: "vercel_ai_gateway",
        provider: "vercel",
        eventModel: "openai/gpt-4o",
    },
];

const VENDOR_FEED: LiteLLMFeed = Object.fromEntries(
    VENDOR_CASES.map((c) => [
        c.feedKey,
        {
            litellm_provider: c.litellmProvider,
            input_cost_per_token: 0.000001,
            output_cost_per_token: 0.000002,
        },
    ]),
);

const asGlobalRows = (
    rates: readonly {
        provider: string;
        model: string;
        region: string;
        inputPer1mUsd: string;
        outputPer1mUsd: string;
        cachePer1mUsd: string | null;
    }[],
): PricingRow[] =>
    rates.map((r, i) => ({
        id: `row-${i}`,
        workspaceId: null,
        ...r,
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
        effectiveTo: null,
    }));

describe("parseFeed new-vendor model normalization", () => {
    // The bug this guards: synced rows kept LiteLLM's `provider/` model prefix
    // while events carry the bare id, so price matching (exact on provider,
    // model, region) never hit and every new-vendor call landed unpriced at $0.
    test.each(VENDOR_CASES)(
        "$provider event $eventModel resolves a non-$0 synced price",
        ({ provider, eventModel }) => {
            const candidates = asGlobalRows(parseFeed(VENDOR_FEED));

            const row = findPricingRow({
                candidates,
                provider,
                model: eventModel,
                region: "global",
                ts: new Date("2026-02-01T00:00:00Z"),
                workspaceId: "ws-1",
            });

            expect(row).not.toBeNull();
            expect(Number.parseFloat(row?.inputPer1mUsd ?? "0")).toBeGreaterThan(0);
            expect(Number.parseFloat(row?.outputPer1mUsd ?? "0")).toBeGreaterThan(0);
        },
    );

    test("preserves OpenRouter's required vendor segment after stripping its prefix", () => {
        const models = parseFeed(VENDOR_FEED).map((r) => r.model);

        expect(models).toContain("anthropic/claude-3.5-sonnet");
    });

    test("leaves size-bucket pseudo-models unchanged (no bare id to map to)", () => {
        const row = parseFeed({
            "together-ai-4.1b-8b": {
                litellm_provider: "together_ai",
                input_cost_per_token: 0.0000002,
                output_cost_per_token: 0.0000002,
            },
        })[0];

        expect(row?.model).toBe("together-ai-4.1b-8b");
    });

    test("dedupes bare + prefixed keys that normalize to the same model", () => {
        const rows = parseFeed({
            "gemini-flash-latest": {
                litellm_provider: "gemini",
                input_cost_per_token: 0.0000003,
                output_cost_per_token: 0.0000025,
            },
            "gemini/gemini-flash-latest": {
                litellm_provider: "gemini",
                input_cost_per_token: 0.0000003,
                output_cost_per_token: 0.0000025,
            },
        }).filter((r) => r.model === "gemini-flash-latest");

        expect(rows).toHaveLength(1);
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
