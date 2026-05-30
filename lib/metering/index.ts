/**
 * Public API of the metering feature.
 *
 * Consumers in `app/` and other features import everything they need from
 * here: schema tables, the pure `calculateCost` deep module, read-side
 * queries (Postgres-backed read repository), the ingest action, and the
 * partition rollover service used by the retention cron.
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

export {
    ingestEventsUseCase,
    type IngestEventsInput,
    type IngestSummary,
} from "./ingest-events.usecase";

export { pruneEvents, type PerWorkspaceSummary, type PruneSummary } from "./prune-events.usecase";

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
export { CLOUD_RETENTION_DAYS, LONGEST_RETENTION_DAYS } from "./retention-policy";
export type {
    PartitionInfo,
    RetentionRepository,
    WorkspaceRetention,
} from "./retention.repository";
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
