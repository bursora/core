/**
 * LiteLLM pricing source adapter.
 *
 * Daily cron pulls https://github.com/BerriAI/litellm's curated price map and
 * surfaces priced entries for our supported vendors as ScrapedRate rows.
 * Per-token costs in the feed are converted to per-1M tokens — the unit every
 * major provider (OpenAI, Anthropic, Google, DeepSeek) displays.
 * Cache-read cost maps to cachePer1mUsd; absent → null. Cache-write cost is
 * ignored (not in schema).
 *
 * Legacy TTS models (tts-1, tts-1-hd) bill per input character, not per token,
 * and the feed exposes only `input_cost_per_character`. They surface as a
 * per-1M-character input rate (output/cache unused) so speech events price and
 * persist instead of dropping as unpriced — the SDK records 0 characters for
 * these today, so the rate yields $0 but matches the published price.
 *
 * Only the vendors in LITELLM_TO_SLUG are surfaced. Both keys are reconciled to
 * what the SDK emits so events match a price: the `litellm_provider` value maps
 * to the canonical provider slug, and the model key drops LiteLLM's
 * `${provider}/` namespace prefix down to the bare id the vendor's API takes
 * (see stripVendorPrefix). Missing rows would silently cost $0.
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
//   gemini            → google   (SDK derives from generativelanguage.googleapis.com)
//   together_ai       → together
//   fireworks_ai      → fireworks
//   vercel_ai_gateway → vercel    (zero-markup routing; key vercel_ai_gateway/<vendor>/<model>
//                                  strips to <vendor>/<model>, the id the gateway API takes)
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
    vercel_ai_gateway: "vercel",
};

interface LiteLLMEntry {
    readonly litellm_provider?: string;
    readonly input_cost_per_token?: number;
    readonly output_cost_per_token?: number;
    readonly cache_read_input_token_cost?: number;
    readonly input_cost_per_character?: number;
    readonly mode?: string;
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
    // A few vendors list a model under both its bare and `${provider}/`-prefixed
    // key; once normalized they collide on (provider, model). Keep the first and
    // drop the rest so the sync doesn't churn versions re-resolving a dup.
    const seen = new Set<string>();
    for (const [key, entry] of Object.entries(feed)) {
        const litellmProvider = entry.litellm_provider;
        if (litellmProvider === undefined) continue;
        const provider = LITELLM_TO_SLUG[litellmProvider];
        if (provider === undefined) continue;

        let inputPer1mUsd: string;
        let outputPer1mUsd: string;
        let cachePer1mUsd: string | null;

        const input = parsePerToken(entry.input_cost_per_token);
        const output = parsePerToken(entry.output_cost_per_token);
        const perChar = parsePerToken(entry.input_cost_per_character);

        if (input !== null && output !== null) {
            const cache = parsePerToken(entry.cache_read_input_token_cost);
            inputPer1mUsd = perTokenToPer1m(input);
            outputPer1mUsd = perTokenToPer1m(output);
            cachePer1mUsd = cache === null ? null : perTokenToPer1m(cache);
        } else if (perChar !== null && entry.mode === "audio_speech") {
            // Legacy TTS: per-character input rate, no output/cache side.
            // NOTE: inputPer1mUsd is the per-token column, but for these
            // per-character TTS models it holds a per-1M-CHARACTER rate, not
            // per-1M-token. Harmless today (TTS records 0 characters → $0), but
            // the stored unit does not match the column's usual meaning.
            inputPer1mUsd = perTokenToPer1m(perChar);
            outputPer1mUsd = "0";
            cachePer1mUsd = null;
        } else {
            continue;
        }

        const model = stripVendorPrefix(litellmProvider, key);
        const dedupeKey = `${provider} ${model}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        rates.push({
            provider,
            model,
            region: "global",
            inputPer1mUsd,
            outputPer1mUsd,
            cachePer1mUsd,
        });
    }
    return rates;
}

// LiteLLM namespaces most non-OpenAI models as `${litellm_provider}/<id>` (e.g.
// groq/llama-3.1-8b-instant, gemini/gemini-2.0-flash), but the SDK reports the
// bare id the vendor's API takes, and price matching is exact. Strip only the
// one leading litellm_provider segment so events match.
//
// Edge cases handled by stripping a single segment:
//   - OpenRouter keys carry a second vendor segment
//     (openrouter/anthropic/claude-3.5-sonnet) that OpenRouter itself requires
//     in the model id, so it's preserved -> anthropic/claude-3.5-sonnet.
//   - groq/together_ai/fireworks_ai sub-namespace some ids
//     (groq/meta-llama/..., fireworks_ai/accounts/fireworks/models/...); the
//     vendor API keeps that tail, so only the provider segment is dropped.
//
// together_ai/fireworks_ai also expose size-bucket pseudo-models
// (together-ai-4.1b-8b, fireworks-ai-default) with no `/`; they carry no bare id
// a real event would emit, so they pass through unchanged and simply never
// match — there's no sane id to map them to.
function stripVendorPrefix(litellmProvider: string, key: string): string {
    const prefix = `${litellmProvider}/`;
    return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

// Returns null when the cost field is absent or invalid. The caller treats
// "absent" identically for required fields (skip the entry) and for the
// optional cache field (persist cache as null).
function parsePerToken(raw: number | undefined): number | null {
    if (raw === undefined) return null;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
    return raw;
}

// Per-unit → per-1M (a unit is a token, or a character for legacy TTS). The
// pricing column is numeric(12, 6); we round to 6 fractional digits to match
// what Postgres will persist anyway and to absorb IEEE-754 drift. parseFloat +
// toString drops trailing zeros without regex juggling. All AI per-1M values sit
// inside [1e-3, 1e6], where Number.toString never emits sci notation.
function perTokenToPer1m(perUnit: number): string {
    return Number.parseFloat((perUnit * 1_000_000).toFixed(6)).toString();
}
