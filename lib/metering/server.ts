/**
 * Metering wiring (write + read).
 *
 * Wires concrete adapters and exposes bound entry points used by route
 * handlers and dashboard pages. Tests inject in-memory fakes via the
 * `setMetering*DepsForTesting` hooks.
 */

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db";
import { redisClient } from "@/lib/redis/client";
import { clickHouseSpendRepository } from "@/lib/spend";
import { createSpendCounter, RedisSpendCounterStore, type SpendCounter } from "@/lib/spend-counter";
import "server-only";
import { env } from "../env";
import { clickHouseMeteringReadRepository } from "./clickhouse-metering-read.repository";
import { ClickHouseUsageEventRepository } from "./clickhouse-usage-event.repository";
import { getSpendSeriesUseCase } from "./get-spend-series.usecase";
import { getTopSpendersUseCase } from "./get-top-spenders.usecase";
import { ingestEventsUseCase } from "./ingest-events.usecase";
import type {
    BlockedEventsPage,
    MeteringFilters,
    MeteringReadRepository,
    MeteringStatusFilter,
    ScopeKind,
} from "./metering-read.repository";
import { drizzlePricingRepository } from "./pricing/drizzle-pricing.repository";
import type { PricingRepository } from "./pricing/pricing-row";
import { RedisRequestDedupGuard, type RequestDedupGuard } from "./request-dedup";
import type { Facet } from "./spend-series";
import type { UsageEventInput } from "./usage-event";
import type { UsageEventRepository } from "./usage-event.repository";

export interface MeteringDeps {
    readonly eventsRepo: UsageEventRepository;
    readonly pricingRepo: PricingRepository;
    readonly dedup: RequestDedupGuard;
    /** Optional in tests; production always wires the Redis-backed counter. */
    readonly spendCounter?: SpendCounter;
}

export interface MeteringReadDeps {
    readonly readRepo: MeteringReadRepository;
}

let testOverride: MeteringDeps | null = null;
let readTestOverride: MeteringReadDeps | null = null;

export function setMeteringDepsForTesting(deps: MeteringDeps | null): void {
    testOverride = deps;
}

export function setMeteringReadDepsForTesting(deps: MeteringReadDeps | null): void {
    readTestOverride = deps;
}

export function meteringDeps(): MeteringDeps {
    if (testOverride !== null) return testOverride;
    const ch = clickhouseClient();
    const redis = redisClient(env().REDIS_URL);
    return {
        eventsRepo: new ClickHouseUsageEventRepository(ch),
        pricingRepo: drizzlePricingRepository(db()),
        dedup: new RedisRequestDedupGuard(redis),
        spendCounter: createSpendCounter({
            store: new RedisSpendCounterStore(redis),
            spend: clickHouseSpendRepository(ch),
        }),
    };
}

function meteringReadDeps(): MeteringReadDeps {
    if (readTestOverride !== null) return readTestOverride;
    return { readRepo: clickHouseMeteringReadRepository(clickhouseClient()) };
}

export async function ingestEvents(input: {
    workspaceId: string;
    events: readonly UsageEventInput[];
}) {
    const deps = meteringDeps();
    return ingestEventsUseCase({
        workspaceId: input.workspaceId,
        events: input.events,
        eventsRepo: deps.eventsRepo,
        pricingRepo: deps.pricingRepo,
        dedup: deps.dedup,
        now: new Date(),
        ...(deps.spendCounter === undefined ? {} : { spendCounter: deps.spendCounter }),
    });
}

interface SpendSeriesInput extends MeteringFilters {
    readonly workspaceId: string;
    readonly facet: Facet;
    readonly from: Date;
    readonly to: Date;
    readonly scopeId?: string | undefined;
    readonly status?: MeteringStatusFilter | undefined;
}

export async function getSpendSeries(input: SpendSeriesInput) {
    const deps = meteringReadDeps();
    return getSpendSeriesUseCase({ ...input, repo: deps.readRepo });
}

interface TopSpendersInput extends MeteringFilters {
    readonly workspaceId: string;
    readonly facet: Facet;
    readonly from: Date;
    readonly to: Date;
    readonly limit: number;
    readonly scopeId?: string | undefined;
    readonly status?: MeteringStatusFilter | undefined;
}

export async function getTopSpenders(input: TopSpendersInput) {
    const deps = meteringReadDeps();
    return getTopSpendersUseCase({ ...input, repo: deps.readRepo });
}

const DISTINCT_VALUES_SINCE_DAYS = 30;
const DISTINCT_VALUES_LIMIT = 50;

export async function listDistinctMeteringValuesBulk(input: {
    workspaceId: string;
    scopes: readonly ScopeKind[];
    now?: Date;
    status?: MeteringStatusFilter;
}) {
    const deps = meteringReadDeps();
    return deps.readRepo.listDistinctValuesBulk({
        workspaceId: input.workspaceId,
        scopes: input.scopes,
        sinceDays: DISTINCT_VALUES_SINCE_DAYS,
        limit: DISTINCT_VALUES_LIMIT,
        now: input.now ?? new Date(),
        status: input.status,
    });
}

interface CountEventsInput extends MeteringFilters {
    readonly workspaceId: string;
    readonly since?: Date;
    readonly status?: MeteringStatusFilter | undefined;
}

export async function countEventsForWorkspace(input: CountEventsInput): Promise<number> {
    const deps = meteringReadDeps();
    return deps.readRepo.countEvents(input);
}

export async function getLastUsageEventAt(input: { workspaceId: string }): Promise<Date | null> {
    const deps = meteringReadDeps();
    return deps.readRepo.getLastUsageEventAt({ workspaceId: input.workspaceId });
}

interface BlockedEventsForBudgetInput {
    readonly workspaceId: string;
    readonly budgetId: string;
    readonly from: Date;
    readonly to: Date;
    readonly cursor?: string;
    readonly limit: number;
}

export async function listBlockedEventsForBudget(
    input: BlockedEventsForBudgetInput,
): Promise<BlockedEventsPage> {
    const deps = meteringReadDeps();
    return deps.readRepo.listBlockedEventsForBudget(input);
}

export async function countBlockedEventsForBudget(input: {
    workspaceId: string;
    budgetId: string;
    from: Date;
    to: Date;
}): Promise<number> {
    const deps = meteringReadDeps();
    return deps.readRepo.countBlockedEventsForBudget(input);
}

interface CumulativeSpendDailyInput {
    readonly workspaceId: string;
    readonly scopeType: "workspace" | "tenant" | "agent" | "workflow";
    readonly scopeId: string | null;
    readonly from: Date;
    readonly to: Date;
}

export async function cumulativeSpendDaily(
    input: CumulativeSpendDailyInput,
): Promise<readonly number[]> {
    const deps = meteringReadDeps();
    return deps.readRepo.cumulativeSpendDaily(input);
}
