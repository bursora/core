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
 *   - Missing pricing row (null) → return Money("0"). The caller is expected
 *     to log a "pricing_missing" warning so unknown models surface
 *     operationally without crashing the write path or losing the event.
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

import { money, type Money } from "./money";
import type { PricingRow } from "./pricing-row";

export interface Usage {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly cacheTokens?: number;
}

export function calculateCost(usage: Usage, row: PricingRow | null): Money {
    if (row === null) return money(0);

    const prompt = clampNonNegative(usage.promptTokens);
    const completion = clampNonNegative(usage.completionTokens);
    const cache = clampNonNegative(usage.cacheTokens ?? 0);

    const inputRate = parseRate(row.inputPer1mUsd);
    const outputRate = parseRate(row.outputPer1mUsd);
    const cacheRate = row.cachePer1mUsd === null ? 0 : parseRate(row.cachePer1mUsd);

    const cost =
        (prompt * inputRate) / 1_000_000 +
        (completion * outputRate) / 1_000_000 +
        (cache * cacheRate) / 1_000_000;

    return money(cost);
}

function clampNonNegative(n: number): number {
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
}

function parseRate(decimalString: string): number {
    const parsed = Number.parseFloat(decimalString);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
}
