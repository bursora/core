/**
 * Public API of the unified spend module.
 *
 * Consumers import the `SpendRepository` interface for typing and the
 * `drizzleSpendRepository` factory to wire it. The two existing high-level
 * surfaces (`SpendAggregator` for budgeting, `MeteringReadRepository.spendSeries`
 * for dashboards) delegate to this module so cost aggregation logic lives in
 * one place.
 */

export { drizzleSpendRepository } from "./drizzle-spend.repository";
export type { GetSpendForScopeInput, GetSpendSeriesInput, SpendRepository } from "./repository";
