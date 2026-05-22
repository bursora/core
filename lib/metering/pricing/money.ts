/**
 * Money value object for USD costs.
 *
 * Uses a fixed-precision decimal string with 8 fractional digits to match
 * the `usage_events.cost_usd numeric(14,8)` column. We keep the value as a
 * string so callers cannot accidentally lose precision through float
 * arithmetic. Domain code constructs Money via `money(usd)`; arithmetic stays
 * inside the deep `calculateCost` module.
 */

export interface Money {
    readonly usd: string;
}

const SCALE = 8;

const ZERO_USD = "0.00000000";

/**
 * Build a Money from a number with 8-digit decimal precision. The input is
 * trusted (computed by `calculateCost` only); callers outside the domain
 * should not construct Money values directly.
 */
export function money(usd: number): Money {
    if (!Number.isFinite(usd) || usd < 0) {
        return { usd: ZERO_USD };
    }
    return { usd: usd.toFixed(SCALE) };
}

export function zeroMoney(): Money {
    return { usd: ZERO_USD };
}
