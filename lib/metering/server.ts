/**
 * Metering wiring (write + read).
 *
 * Wires concrete adapters and exposes bound entry points used by route
 * handlers and dashboard pages. Tests inject in-memory fakes via the
 * `setMetering*DepsForTesting` hooks.
 */

import { db } from "@/lib/db";
import "server-only";
import { countEventsForWorkspaceUseCase } from "./count-events-for-workspace.usecase";
import { drizzleMeteringReadRepository } from "./drizzle-metering-read.repository";
import { DrizzleUsageEventRepository } from "./drizzle-usage-event.repository";
import { getLastUsageEventAtUseCase } from "./get-last-usage-event-at.usecase";
import { getSpendSeriesUseCase } from "./get-spend-series.usecase";
import { getTopSpendersUseCase } from "./get-top-spenders.usecase";
import { ingestEventsUseCase } from "./ingest-events.usecase";
import { listDistinctMeteringValuesBulkUseCase } from "./list-distinct-metering-values-bulk.usecase";
import type {
    BlockedEventsPage,
    MeteringFilters,
    MeteringReadRepository,
    MeteringStatusFilter,
    ScopeKind,
} from "./metering-read.repository";
import { drizzlePricingRepository } from "./pricing/drizzle-pricing.repository";
import type { PricingRepository } from "./pricing/pricing-row";
import type { Facet } from "./spend-series";
import type { UsageEventInput } from "./usage-event";
import type { UsageEventRepository } from "./usage-event.repository";

export interface MeteringDeps {
    readonly eventsRepo: UsageEventRepository;
    readonly pricingRepo: PricingRepository;
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
    return {
        eventsRepo: new DrizzleUsageEventRepository(db()),
        pricingRepo: drizzlePricingRepository(db()),
    };
}

function meteringReadDeps(): MeteringReadDeps {
    if (readTestOverride !== null) return readTestOverride;
    return { readRepo: drizzleMeteringReadRepository(db()) };
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

export async function listDistinctMeteringValuesBulk(input: {
    workspaceId: string;
    scopes: readonly ScopeKind[];
    now?: Date;
    status?: MeteringStatusFilter;
}) {
    const deps = meteringReadDeps();
    return listDistinctMeteringValuesBulkUseCase({
        workspaceId: input.workspaceId,
        scopes: input.scopes,
        now: input.now ?? new Date(),
        repo: deps.readRepo,
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
    return countEventsForWorkspaceUseCase({ ...input, repo: deps.readRepo });
}

export async function getLastUsageEventAt(input: { workspaceId: string }): Promise<Date | null> {
    const deps = meteringReadDeps();
    return getLastUsageEventAtUseCase({ workspaceId: input.workspaceId, repo: deps.readRepo });
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
