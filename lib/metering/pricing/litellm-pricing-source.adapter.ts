/**
 * LiteLLM pricing source adapter.
 *
 * Daily cron pulls https://github.com/BerriAI/litellm's curated price map and
 * surfaces OpenAI + Anthropic + DeepSeek entries as ScrapedRate rows.
 * Per-token costs in the feed are converted to per-1M tokens — the unit every
 * major provider (OpenAI, Anthropic, Google, Azure, DeepSeek) displays.
 * Cache-read cost maps to cachePer1mUsd; absent → null. Cache-write cost is
 * ignored (not in schema).
 *
 * Filters to openai/anthropic/deepseek. All matching entries kept verbatim -
 * missing rows would silently cost $0.
 *
 * Non-2xx fetches throw; bad shape throws. The surrounding `syncPricing`
 * use case catches and records this as `failedProviders: ["litellm"]`.
 */

import type { PricingSource, ScrapedRate } from "./pricing-source";

const FEED_URL =
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const USER_AGENT = "bursora-pricing-sync";

type AllowedVendor = "openai" | "anthropic" | "deepseek";

const ALLOWED_PROVIDERS: ReadonlySet<AllowedVendor> = new Set<AllowedVendor>([
    "openai",
    "anthropic",
    "deepseek",
]);

const isAllowedVendor = (value: string): value is AllowedVendor =>
    (ALLOWED_PROVIDERS as ReadonlySet<string>).has(value);

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
        const provider = entry.litellm_provider;
        if (provider === undefined || !isAllowedVendor(provider)) continue;

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
