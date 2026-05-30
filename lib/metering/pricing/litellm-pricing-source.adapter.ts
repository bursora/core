/**
 * LiteLLM pricing source adapter.
 *
 * Daily cron pulls https://github.com/BerriAI/litellm's curated price map and
 * surfaces priced entries for our supported vendors as ScrapedRate rows.
 * Per-token costs in the feed are converted to per-1M tokens — the unit every
 * major provider (OpenAI, Anthropic, Google, Azure, DeepSeek) displays.
 * Cache-read cost maps to cachePer1mUsd; absent → null. Cache-write cost is
 * ignored (not in schema).
 *
 * Only the vendors in LITELLM_TO_SLUG are surfaced, mapped from LiteLLM's
 * `litellm_provider` value to the canonical slug the SDK emits so events match
 * a price. All matching entries kept verbatim - missing rows would silently
 * cost $0.
 *
 * Non-2xx fetches throw; bad shape throws. The surrounding `syncPricing`
 * use case catches per-source errors, completes the remaining sources, then
 * throws `PricingSyncPartialFailure` listing this provider.
 */

import type { PricingSource, ScrapedRate } from "./pricing-source";

const FEED_URL =
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const USER_AGENT = "bursora-pricing-sync";

// LiteLLM's `litellm_provider` value → the canonical provider slug the SDK
// emits on usage events. Doubles as the allowlist (only these feed slugs are
// surfaced) and the reconciliation map: three vendors are keyed differently by
// LiteLLM than by our SDK, so rows are stored under the slug the SDK reports —
// otherwise an event's provider would never match a synced price.
//   gemini       → google      (SDK derives from generativelanguage.googleapis.com)
//   together_ai  → together
//   fireworks_ai → fireworks
const LITELLM_TO_SLUG: Readonly<Record<string, string>> = {
    openai: "openai",
    anthropic: "anthropic",
    deepseek: "deepseek",
    gemini: "google",
    groq: "groq",
    xai: "xai",
    mistral: "mistral",
    together_ai: "together",
    fireworks_ai: "fireworks",
    perplexity: "perplexity",
    openrouter: "openrouter",
};

interface LiteLLMEntry {
    readonly litellm_provider?: string;
    readonly input_cost_per_token?: number;
    readonly output_cost_per_token?: number;
    readonly cache_read_input_token_cost?: number;
}

export type LiteLLMFeed = Readonly<Record<string, LiteLLMEntry>>;

export const litellmPricingSource: PricingSource = {
    provider: "litellm",
    fetchRates: async () => parseFeed(await fetchFeed()),
};

export async function fetchFeed(): Promise<LiteLLMFeed> {
    const res = await fetch(FEED_URL, {
        headers: { "user-agent": USER_AGENT },
    });
    if (!res.ok) {
        throw new Error(`litellm feed fetch failed: ${res.status} ${res.statusText}`);
    }
    const json: unknown = await res.json();
    if (json === null || typeof json !== "object") {
        throw new Error("litellm feed: expected JSON object at root");
    }
    return json as LiteLLMFeed;
}

export function parseFeed(feed: LiteLLMFeed): ScrapedRate[] {
    const rates: ScrapedRate[] = [];
    for (const [model, entry] of Object.entries(feed)) {
        const litellmProvider = entry.litellm_provider;
        if (litellmProvider === undefined) continue;
        const provider = LITELLM_TO_SLUG[litellmProvider];
        if (provider === undefined) continue;

        const input = parsePerToken(entry.input_cost_per_token);
        const output = parsePerToken(entry.output_cost_per_token);
        if (input === null || output === null) continue;

        const cache = parsePerToken(entry.cache_read_input_token_cost);

        rates.push({
            provider,
            model,
            region: "global",
            inputPer1mUsd: perTokenToPer1m(input),
            outputPer1mUsd: perTokenToPer1m(output),
            cachePer1mUsd: cache === null ? null : perTokenToPer1m(cache),
        });
    }
    return rates;
}

// Returns null when the cost field is absent or invalid. The caller treats
// "absent" identically for required fields (skip the entry) and for the
// optional cache field (persist cache as null).
function parsePerToken(raw: number | undefined): number | null {
    if (raw === undefined) return null;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
    return raw;
}

// Per-token → per-1M. The pricing column is numeric(12, 6); we round to 6
// fractional digits to match what Postgres will persist anyway and to absorb
// IEEE-754 drift. parseFloat + toString drops trailing zeros without regex
// juggling. All AI per-1M values sit inside [1e-3, 1e6], where Number.toString
// never emits sci notation.
function perTokenToPer1m(perToken: number): string {
    return Number.parseFloat((perToken * 1_000_000).toFixed(6)).toString();
}
