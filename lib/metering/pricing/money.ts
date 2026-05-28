/**
 * Money value object for USD costs.
 *
 * Uses a fixed-precision decimal string with 8 fractional digits to match
 * the `usage_events.cost_usd numeric(14,8)` column. We keep the value as a
 * string so callers cannot accidentally lose precision through float
 * arithmetic. Domain code constructs Money via `moneyFromBig(cost)`; the math
 * itself stays inside the deep `calculateCost` module and runs against
 * `big.js` exact-decimal arithmetic (no IEEE 754 drift).
 */

import Big from "big.js";

export interface Money {
    readonly usd: string;
}

const SCALE = 8;

const ZERO_USD = "0.00000000";

/**
 * Build a Money from a `Big` decimal value. Rounds to 8 fractional digits
 * half-up so the persisted string matches the `numeric(14,8)` column shape.
 * Negative or invalid inputs map to zero so the domain never persists a
 * negative cost.
 */
export function moneyFromBig(usd: Big): Money {
    if (usd.lt(0)) return { usd: ZERO_USD };
    return { usd: usd.toFixed(SCALE, Big.roundHalfUp) };
}

/**
 * Build a Money from a primitive USD number. Convenience for resolver
 * implementations and tests that already hold a JS number; the constructor
 * wraps in `Big` so the persisted decimal matches `numeric(14,8)` shape
 * without IEEE 754 rounding artefacts. Domain math should construct `Big`
 * values directly and prefer `moneyFromBig`.
 */
export function money(usd: number): Money {
    if (!Number.isFinite(usd) || usd < 0) return { usd: ZERO_USD };
    return moneyFromBig(new Big(usd));
}

export function zeroMoney(): Money {
    return { usd: ZERO_USD };
}
