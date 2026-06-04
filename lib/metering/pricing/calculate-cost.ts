/**
 * calculateCost — DEEP MODULE.
 *
 * Pure function that computes the USD cost of a single LLM call given a
 * fully-resolved pricing row. No DB. No network. No clock.
 *
 * The interface is intentionally small: two arguments, one return value. The
 * implementation absorbs all the pricing math, edge cases, and precision
 * concerns. Callers (the metering ingest path) need only supply the usage
 * counters and the row that was effective at event time — they do not need
 * to know how the cost is shaped.
 *
 * Policy decisions:
 *   - Missing pricing row (null) → throw `UnknownPricingError`. The ingest
 *     path catches the throw, sets that event aside, and reports the unpriced
 *     (provider, model) pair back to the SDK so the customer learns about
 *     unpriced models instead of silently billing zero. The priced events in
 *     the same batch still persist. Previously this returned Money("0"); see
 *     issue #915.
 *   - Cache reads price at `cachePer1mUsd`; cache writes (`cacheWriteTokens`,
 *     a subset of `cacheTokens`) price at the base input rate times
 *     CACHE_WRITE_MULTIPLIER. When `cachePer1mUsd === null` the read side
 *     contributes zero, but writes still bill off the input rate.
 *   - Negative or non-finite token counts are clamped to zero. The validator
 *     at the API boundary should already reject those, but the domain stays
 *     defensive.
 *   - Output precision: numeric(14,8) — 8 fractional digits. This matches the
 *     `usage_events.cost_usd` column and keeps sub-cent costs representable.
 *
 * Does NOT enforce effectiveFrom/effectiveTo — selecting the correct row is
 * the caller's responsibility (see find-pricing-row.ts).
 */

import Big from "big.js";
import { moneyFromBig, type Money } from "./money";
import type { PricingRow } from "./pricing-row";

export interface Usage {
    readonly promptTokens: number;
    readonly completionTokens: number;
    /** Total cache tokens (writes + reads). */
    readonly cacheTokens?: number;
    /**
     * Subset of `cacheTokens` that are cache WRITES. Writes are priced at the
     * base input rate times {@link CACHE_WRITE_MULTIPLIER}; the remaining cache
     * tokens (reads) are priced at `cachePer1mUsd`. Absent → 0, so every cache
     * token falls to the read rate (the pre-split behavior).
     */
    readonly cacheWriteTokens?: number;
}

/**
 * Raised when no pricing row exists for an event's (provider, model, region,
 * ts) tuple. The ingest path catches it per event, sets that event aside, and
 * reports the unpriced (provider, model) pair back so the SDK author (and the
 * customer's ops) learn about the gap instead of seeing a silent $0 charge —
 * while the priced events in the same batch still persist.
 *
 * `calculateCost` raises the context-free form (it sees only a null row); the
 * resolver re-raises with the offending `provider`/`model` attached.
 */
export class UnknownPricingError extends Error {
    readonly provider: string | null;
    readonly model: string | null;

    constructor(args: { readonly provider: string; readonly model: string } | null = null) {
        super("pricing_unknown");
        this.name = "UnknownPricingError";
        this.provider = args?.provider ?? null;
        this.model = args?.model ?? null;
    }
}

/**
 * Dedicated Big constructor for the cost math. `Big()` returns a fresh
 * constructor with its own DP/RM, isolated from the global `Big.DP`. We pin a
 * high division precision so an intermediate `div(PER_1M)` keeps full precision
 * even if another module lowers the global `Big.DP`; the final round-to-8
 * happens in `moneyFromBig`. Without this, a global DP below ~8 would truncate
 * the quotient early and undercharge.
 */
const CostBig = Big();
CostBig.DP = 40;
CostBig.RM = Big.roundHalfUp;

const PER_1M = new CostBig(1_000_000);
const ZERO_RATE = new CostBig(0);

/**
 * Cache-write tokens bill at the base input rate times this factor. Anthropic
 * is the only provider that reports cache writes (OpenAI/Google caches are
 * read-only), and its 5-minute cache-write rate is a fixed 1.25x base input
 * across every Claude model — confirmed by the litellm feed ratio
 * (cache_creation_input_token_cost / input_cost_per_token === 1.25). Deriving
 * the write rate from the input rate (rather than syncing a separate column)
 * keeps it correct under workspace input-rate overrides for free.
 *
 * 1-hour cache writes bill at 2x, but the usage event carries only the merged
 * `cache_creation_input_tokens` count, so those are priced at 1.25x here too.
 */
const CACHE_WRITE_MULTIPLIER = new CostBig("1.25");

export function calculateCost(usage: Usage, row: PricingRow | null): Money {
    if (row === null) throw new UnknownPricingError();

    const cacheWriteTokens = clampNonNegative(usage.cacheWriteTokens ?? 0);
    const cacheTotalTokens = clampNonNegative(usage.cacheTokens ?? 0);
    // Writes are a subset of the total; the remainder is cache reads. Clamp so
    // malformed input (writes > total) never yields a negative read count.
    const cacheReadTokens = Math.max(0, cacheTotalTokens - cacheWriteTokens);

    const prompt = new CostBig(clampNonNegative(usage.promptTokens));
    const completion = new CostBig(clampNonNegative(usage.completionTokens));
    const cacheRead = new CostBig(cacheReadTokens);
    const cacheWrite = new CostBig(cacheWriteTokens);

    const inputRate = parseRate(row.inputPer1mUsd);
    const outputRate = parseRate(row.outputPer1mUsd);
    const cacheReadRate = row.cachePer1mUsd === null ? ZERO_RATE : parseRate(row.cachePer1mUsd);
    const cacheWriteRate = inputRate.times(CACHE_WRITE_MULTIPLIER);

    const cost = prompt
        .times(inputRate)
        .div(PER_1M)
        .plus(completion.times(outputRate).div(PER_1M))
        .plus(cacheRead.times(cacheReadRate).div(PER_1M))
        .plus(cacheWrite.times(cacheWriteRate).div(PER_1M));

    return moneyFromBig(cost);
}

function clampNonNegative(n: number): number {
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
}

function parseRate(decimalString: string): Big {
    // PricingRow numerics arrive from postgres as decimal strings; parse them
    // through the scoped CostBig so the precision of the original column is
    // preserved end-to-end and the division precision stays pinned. Defensive
    // on malformed inputs (Big throws on non-numeric).
    try {
        const parsed = new CostBig(decimalString);
        return parsed.lt(0) ? ZERO_RATE : parsed;
    } catch {
        return ZERO_RATE;
    }
}
