/**
 * ingestEvents — orchestrator for the metering write path.
 *
 * Per event:
 *   1. Look up the pricing row effective at `event.ts` for the caller's
 *      workspace via the pricing application boundary.
 *   2. Compute cost via the pure `calculateCost` deep module.
 *   3. Tag every row with the `workspaceId` derived from the api key — never
 *      from the request body.
 *   4. Persist the batch in a single repository call.
 *
 * Missing pricing rows do not abort the write — cost_usd is set to "0.00000000"
 * and a warning is logged. This keeps the ingest path resilient when a caller
 * sends events for a model the daily pricing cron has not yet scraped.
 */

import { calculateCost } from "./pricing/calculate-cost";
import { lookup as lookupPricingRow } from "./pricing/lookup";
import type { PricingRepository } from "./pricing/pricing-row";
import type { UsageEventInput, UsageEventRow } from "./usage-event";
import type { UsageEventRepository } from "./usage-event.repository";

export interface IngestLogger {
    warn(message: string, meta?: Record<string, unknown>): void;
}

export interface IngestEventsInput {
    readonly workspaceId: string;
    readonly events: readonly UsageEventInput[];
    readonly eventsRepo: UsageEventRepository;
    readonly pricingRepo: PricingRepository;
    readonly logger?: IngestLogger;
}

export interface IngestSummary {
    readonly inserted: number;
}

const DEFAULT_LOGGER: IngestLogger = {
    warn: (message, meta) => console.warn(message, meta ?? {}),
};

export async function ingestEventsUseCase(input: IngestEventsInput): Promise<IngestSummary> {
    if (input.events.length === 0) {
        return { inserted: 0 };
    }

    const logger = input.logger ?? DEFAULT_LOGGER;

    // Group events by (provider, model, region, ts-bucket) so a 100-event batch
    // touching 3 unique models issues 3 lookups, not 100. ts is bucketed to the
    // calendar day in UTC since pricing rows have day-granularity effective
    // ranges; events on the same day always resolve to the same row.
    const lookupKey = (e: UsageEventInput): string =>
        `${e.provider}${e.model}${e.region ?? ""}${tsBucket(e.ts)}`;

    const uniqueKeys = new Map<string, UsageEventInput>();
    for (const event of input.events) {
        const key = lookupKey(event);
        if (!uniqueKeys.has(key)) {
            uniqueKeys.set(key, event);
        }
    }

    const keys = [...uniqueKeys.keys()];
    const samples = [...uniqueKeys.values()];
    const lookups = await Promise.all(
        samples.map((event) =>
            lookupPricingRow({
                provider: event.provider,
                model: event.model,
                region: event.region,
                ts: event.ts,
                workspaceId: input.workspaceId,
                pricing: input.pricingRepo,
            }),
        ),
    );
    const pricingByKey = new Map(keys.map((k, i) => [k, lookups[i] ?? null]));

    const rows: UsageEventRow[] = input.events.map((event) => {
        const row = pricingByKey.get(lookupKey(event)) ?? null;
        if (row === null) {
            logger.warn("metering.pricing_missing", {
                workspaceId: input.workspaceId,
                provider: event.provider,
                model: event.model,
                region: event.region,
                ts: event.ts.toISOString(),
            });
        }
        const cost = calculateCost(
            {
                promptTokens: event.promptTokens,
                completionTokens: event.completionTokens,
                cacheTokens: event.cacheTokens,
            },
            row,
        );
        return {
            workspaceId: input.workspaceId,
            tenantId: event.tenantId,
            agentId: event.agentId,
            workflowId: event.workflowId,
            provider: event.provider,
            model: event.model,
            promptTokens: event.promptTokens,
            completionTokens: event.completionTokens,
            cacheTokens: event.cacheTokens,
            latencyMs: event.latencyMs,
            costUsd: cost.usd,
            requestId: event.requestId,
            ts: event.ts,
        };
    });

    await input.eventsRepo.insertBatch(rows);

    return { inserted: rows.length };
}

const tsBucket = (ts: Date): string => ts.toISOString().slice(0, 10);
