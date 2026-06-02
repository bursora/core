/**
 * Public API of the metering feature.
 *
 * Consumers in `app/` and other features import everything they need from
 * here: the pure `calculateCost` deep module, read-side queries (the
 * ClickHouse-backed read repository), and the ingest action.
 */

export { UnknownPricingError, calculateCost, type Usage } from "./pricing/calculate-cost";
export { money, zeroMoney, type Money } from "./pricing/money";
export {
    createDrizzlePricingResolver,
    type DrizzlePricingResolverDeps,
    type PricingResolver,
    type PricingResolverInput,
} from "./pricing/pricing-resolver";

export { getSpendSeriesUseCase, type GetSpendSeriesInput } from "./get-spend-series.usecase";
export { getTopSpendersUseCase, type GetTopSpendersInput } from "./get-top-spenders.usecase";

export type { MeteringDeps, MeteringReadDeps } from "./server";

// Type-only: `ingest-events.usecase` transitively imports the `server-only`
// `request-dedup` guard, so re-exporting its runtime function here would pull
// server-only code into any client bundle that imports this barrel (the
// activity/spend filter constants). Server callers import `ingestEventsUseCase`
// from `./ingest-events.usecase` directly.
export type { IngestEventsInput, IngestSummary } from "./ingest-events.usecase";

// Type-only for the same reason: `request-dedup` is `server-only`. Runtime
// consumers import the guard and `dedupKey` from `./request-dedup` directly.
export type { RequestDedupGuard } from "./request-dedup";

export { decodeBlockedEventsCursor, encodeBlockedEventsCursor } from "./metering-read.repository";

export type {
    BlockedEventRow,
    BlockedEventsForBudgetQuery,
    BlockedEventsPage,
    CountBlockedEventsForBudgetQuery,
    CountEventsQuery,
    CumulativeSpendDailyQuery,
    DistinctValueWithCount,
    DistinctValuesByScope,
    LastUsageEventAtQuery,
    ListDistinctValuesBulkQuery,
    MeteringFilters,
    MeteringReadRepository,
    MeteringStatusFilter,
    ScopeKind,
    SpendSeriesQuery,
    TopSpenderRow,
    TopSpendersQuery,
} from "./metering-read.repository";
export { CLOUD_RETENTION_DAYS } from "./retention-policy";
export {
    UNTAGGED,
    type Facet,
    type FacetedSeries,
    type SeriesPoint,
    type SpendWindow,
} from "./spend-series";
export type { TopSpender } from "./top-spender";
export type { UsageEventInput, UsageEventRow } from "./usage-event";
export type { UsageEventRepository } from "./usage-event.repository";

export {
    DEFAULT_ACTIVITY_LIMIT,
    listActivityPageUseCase,
    listActivityUseCase,
    parseActivityCursor,
    type ActivityFilters,
    type ActivityItem,
    type ActivityKind,
    type ActivityPage,
    type ActivitySeverity,
    type EventBucket,
    type KeyEvent,
    type ListActivityInput,
    type ListActivityPageInput,
    type SetupErrorEvent,
} from "./list-activity.usecase";

export {
    ACTIVITY_KIND_LABELS,
    ACTIVITY_KIND_VALUES,
    ACTIVITY_RANGE_MS,
    ACTIVITY_RANGE_VALUES,
    ACTIVITY_SEVERITY_VALUES,
    deserializeActivityFilters,
    parseActivityOption,
    serializeActivityFilters,
    type ActivityFilterParams,
    type ActivityRange,
} from "./activity-filter-params";
