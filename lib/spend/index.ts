/**
 * Public API of the unified spend module.
 *
 * Consumers import the `SpendRepository` interface for typing and the
 * `clickHouseSpendRepository` factory to wire it. The two high-level surfaces
 * (`SpendAggregator` for budgeting, `MeteringReadRepository.spendSeries` for
 * dashboards) delegate to this module so cost aggregation logic lives in one
 * place.
 */

export { clickHouseSpendRepository } from "./clickhouse-spend.repository";
export type { GetSpendForScopeInput, GetSpendSeriesInput, SpendRepository } from "./repository";
