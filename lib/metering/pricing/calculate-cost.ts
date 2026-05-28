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
 *     path catches the throw and returns 400 `pricing_unknown` to the SDK so
 *     the customer learns about unpriced models instead of silently billing
 *     zero. Previously this returned Money("0"); see issue #915.
 *   - Cache pricing absent on the row (cachePer1mUsd === null) → cache side
 *     contributes zero, even when cacheTokens > 0.
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
    readonly cacheTokens?: number;
}

/**
 * Raised when no pricing row exists for an event's (provider, model, region,
 * ts) tuple. The ingest path catches and renders a 400 `pricing_unknown`
 * response so the SDK author (and the customer's ops) learn about the gap
 * instead of seeing a silent $0 charge.
 *
 * `calculateCost` raises the context-free form (it sees only a null row). The
 * ingest use case re-raises with the offending `provider`/`model` attached so
 * the route handler can echo them on the wire without re-deriving them.
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

export function calculateCost(usage: Usage, row: PricingRow | null): Money {
    if (row === null) throw new UnknownPricingError();

    const prompt = new CostBig(clampNonNegative(usage.promptTokens));
    const completion = new CostBig(clampNonNegative(usage.completionTokens));
    const cache = new CostBig(clampNonNegative(usage.cacheTokens ?? 0));

    const inputRate = parseRate(row.inputPer1mUsd);
    const outputRate = parseRate(row.outputPer1mUsd);
    const cacheRate = row.cachePer1mUsd === null ? ZERO_RATE : parseRate(row.cachePer1mUsd);

    const cost = prompt
        .times(inputRate)
        .div(PER_1M)
        .plus(completion.times(outputRate).div(PER_1M))
        .plus(cache.times(cacheRate).div(PER_1M));

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
