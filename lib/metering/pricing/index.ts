/**
 * Public API of the pricing feature.
 *
 * Pricing has no UI surface; it's a pure read concern consumed by metering's
 * cost-calculation path. Consumers import everything they need from here.
 */

export { lookup, type LookupInput } from "./lookup";
export type { NewPricingRow, PricingRepository, PricingRow } from "./pricing-row";
