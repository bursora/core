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
 *     CACHE_WRITE_MULTIPLIER (1.25x), except the 1-hour-TTL slice
 *     (`cacheWrite1hTokens`, a subset of `cacheWriteTokens`) which prices at
 *     CACHE_WRITE_1H_MULTIPLIER (2x). When `cachePer1mUsd === null` the read
 *     side contributes zero, but writes still bill off the input rate.
 *   - Batch calls (`batch === true`) bill at BATCH_MULTIPLIER (0.5x) the total.
 *     OpenAI `batches` and Anthropic Message Batches both discount every token
 *     type 50% off the synchronous rate, so the multiplier rides the final sum
 *     and composes with the cache-write split for free.
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
    /**
     * Subset of `cacheWriteTokens` written with a 1-hour TTL. These price at the
     * base input rate times {@link CACHE_WRITE_1H_MULTIPLIER} (2x); the remaining
     * writes (5-minute TTL) stay at {@link CACHE_WRITE_MULTIPLIER} (1.25x).
     * Absent → 0, so every write falls to the 1.25x rate (the pre-split behavior).
     */
    readonly cacheWrite1hTokens?: number;
    /**
     * True for asynchronous batch-API calls (OpenAI `batches`, Anthropic Message
     * Batches), which bill 50% off the synchronous rate. The whole cost is
     * scaled by {@link BATCH_MULTIPLIER}. Absent → full price (the default).
     */
    readonly batch?: boolean;
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
 */
const CACHE_WRITE_MULTIPLIER = new CostBig("1.25");

/**
 * 1-hour cache writes bill at 2x base input (versus 1.25x for the 5-minute
 * default). The SDK reports the 1-hour slice on its own (`cacheWrite1hTokens`,
 * a subset of `cacheWriteTokens`) from Anthropic's
 * `cache_creation.ephemeral_1h_input_tokens`, so the two TTLs price apart here.
 */
const CACHE_WRITE_1H_MULTIPLIER = new CostBig("2");

/**
 * Batch-API calls bill 50% off the synchronous rate. Both OpenAI `batches` and
 * Anthropic Message Batches apply the same flat discount across every token
 * type (input, output, cache read, cache write), so a single multiplier on the
 * summed cost is exact.
 */
const BATCH_MULTIPLIER = new CostBig("0.5");

export function calculateCost(usage: Usage, row: PricingRow | null): Money {
    if (row === null) throw new UnknownPricingError();

    const cacheWriteTokens = clampNonNegative(usage.cacheWriteTokens ?? 0);
    const cacheTotalTokens = clampNonNegative(usage.cacheTokens ?? 0);
    // Writes are a subset of the total; the remainder is cache reads. Clamp so
    // malformed input (writes > total) never yields a negative read count.
    const cacheReadTokens = Math.max(0, cacheTotalTokens - cacheWriteTokens);
    // 1-hour writes are a subset of all writes; the remainder are 5-minute
    // writes. Clamp so malformed input (1h > total writes) never yields a
    // negative 5-minute count.
    const cacheWrite1hTokens = Math.min(
        clampNonNegative(usage.cacheWrite1hTokens ?? 0),
        cacheWriteTokens,
    );
    const cacheWrite5mTokens = cacheWriteTokens - cacheWrite1hTokens;

    const prompt = new CostBig(clampNonNegative(usage.promptTokens));
    const completion = new CostBig(clampNonNegative(usage.completionTokens));
    const cacheRead = new CostBig(cacheReadTokens);
    const cacheWrite5m = new CostBig(cacheWrite5mTokens);
    const cacheWrite1h = new CostBig(cacheWrite1hTokens);

    const inputRate = parseRate(row.inputPer1mUsd);
    const outputRate = parseRate(row.outputPer1mUsd);
    const cacheReadRate = row.cachePer1mUsd === null ? ZERO_RATE : parseRate(row.cachePer1mUsd);
    const cacheWrite5mRate = inputRate.times(CACHE_WRITE_MULTIPLIER);
    const cacheWrite1hRate = inputRate.times(CACHE_WRITE_1H_MULTIPLIER);

    const cost = prompt
        .times(inputRate)
        .div(PER_1M)
        .plus(completion.times(outputRate).div(PER_1M))
        .plus(cacheRead.times(cacheReadRate).div(PER_1M))
        .plus(cacheWrite5m.times(cacheWrite5mRate).div(PER_1M))
        .plus(cacheWrite1h.times(cacheWrite1hRate).div(PER_1M));

    return moneyFromBig(usage.batch === true ? cost.times(BATCH_MULTIPLIER) : cost);
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
