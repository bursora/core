/**
 * ingestEvents — orchestrator for the metering write path.
 *
 * Per event:
 *   1. Ask the `PricingResolver` for the cost in effect at `event.ts` for the
 *      caller's workspace. The resolver collapses the previous lookup-row /
 *      find-row / calculate-cost trio behind a one-method seam so tests can
 *      inject a hardcoded resolver and the orchestration stays out of this
 *      file. The default Drizzle resolver memoizes lookups by
 *      (provider, model, region, day) so the per-event call pattern still
 *      coalesces into one repo hit per unique tuple.
 *   2. Tag every row with the `workspaceId` derived from the api key — never
 *      from the request body.
 *   3. Persist the priced rows in a single repository call.
 *
 * Pricing is partitioned, not all-or-nothing. An event whose (provider, model)
 * has no pricing row surfaces as `UnknownPricingError` from the resolver; the
 * orchestrator sets that event aside as `unpriced` and reports the deduped
 * (provider, model) pairs back to the caller, while the priced rows in the
 * same batch still persist. This keeps known spend landing (so budgets stay
 * accurate) and still surfaces the unpriced models so the SDK author and the
 * customer's ops see the gap (issue #915). Silently storing cost_usd = 0 would
 * hide real spend until the bill landed; dropping the whole batch on one
 * unpriced event would lose real, priced spend.
 */

import { UnknownPricingError } from "./pricing/calculate-cost";
import {
    createDrizzlePricingResolver,
    type PricingResolver,
} from "./pricing/pricing-resolver";
import type { PricingRepository } from "./pricing/pricing-row";
import type { UsageEventInput, UsageEventRow } from "./usage-event";
import type { UsageEventRepository } from "./usage-event.repository";

export interface IngestEventsInput {
    readonly workspaceId: string;
    readonly events: readonly UsageEventInput[];
    readonly eventsRepo: UsageEventRepository;
    readonly pricingRepo: PricingRepository;
    /**
     * Optional override for the pricing decision. Defaults to a Drizzle-backed
     * resolver wired from `pricingRepo`. Tests inject a hardcoded resolver to
     * avoid touching pricing infrastructure.
     */
    readonly pricingResolver?: PricingResolver;
}

export interface UnpricedModel {
    readonly provider: string;
    readonly model: string;
}

export interface IngestSummary {
    readonly inserted: number;
    /** Deduped (provider, model) pairs whose events had no pricing row. */
    readonly unpriced: readonly UnpricedModel[];
}

type ResolvedEvent =
    | { readonly kind: "priced"; readonly row: UsageEventRow }
    | { readonly kind: "unpriced"; readonly provider: string; readonly model: string };

export async function ingestEventsUseCase(input: IngestEventsInput): Promise<IngestSummary> {
    if (input.events.length === 0) {
        return { inserted: 0, unpriced: [] };
    }

    const resolver =
        input.pricingResolver ??
        createDrizzlePricingResolver({ pricingRepo: input.pricingRepo });

    const resolved: ResolvedEvent[] = await Promise.all(
        input.events.map(async (event): Promise<ResolvedEvent> => {
            try {
                const cost = await resolver.resolveCost({
                    workspaceId: input.workspaceId,
                    usage: {
                        promptTokens: event.promptTokens,
                        completionTokens: event.completionTokens,
                        cacheTokens: event.cacheTokens,
                    },
                    provider: event.provider,
                    model: event.model,
                    region: event.region,
                    ts: event.ts,
                });
                return {
                    kind: "priced",
                    row: {
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
                    },
                };
            } catch (err) {
                if (err instanceof UnknownPricingError) {
                    return { kind: "unpriced", provider: event.provider, model: event.model };
                }
                throw err;
            }
        }),
    );

    const rows: UsageEventRow[] = [];
    const unpriced = new Map<string, UnpricedModel>();
    for (const result of resolved) {
        if (result.kind === "priced") {
            rows.push(result.row);
            continue;
        }
        const key = `${result.provider}\u0000${result.model}`;
        if (!unpriced.has(key)) {
            unpriced.set(key, { provider: result.provider, model: result.model });
        }
    }

    // `inserted` is priced rows actually written. Retried `requestId`s dedup at
    // the unique index and are excluded, so the caller bills the bundle by real
    // writes, not the requested count (issue #1002).
    const inserted = rows.length > 0 ? await input.eventsRepo.insertBatch(rows) : 0;

    return { inserted, unpriced: [...unpriced.values()] };
}
