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
import { createDrizzlePricingResolver, type PricingResolver } from "./pricing/pricing-resolver";
import type { PricingRepository } from "./pricing/pricing-row";
import { dedupKey, type RequestDedupGuard } from "./request-dedup";
import { erroredUsageEventRow, type UsageEventInput, type UsageEventRow } from "./usage-event";
import type { UsageEventRepository } from "./usage-event.repository";

export interface IngestEventsInput {
    readonly workspaceId: string;
    readonly events: readonly UsageEventInput[];
    readonly eventsRepo: UsageEventRepository;
    readonly pricingRepo: PricingRepository;
    /**
     * Drops retried `(workspaceId, requestId)` deliveries before they reach the
     * sink. The repository sink no longer dedups (ClickHouse MergeTree has no
     * `ON CONFLICT`), so this is the only idempotency layer.
     */
    readonly dedup: RequestDedupGuard;
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
    /**
     * Inserted rows that count toward the fair-use event bundle: successful and
     * blocked calls, excluding `status='errored'` failures (which carry no value
     * and no cost).
     */
    readonly billable: number;
    /** Deduped (provider, model) pairs whose events had no pricing row. */
    readonly unpriced: readonly UnpricedModel[];
}

type ResolvedEvent =
    | { readonly kind: "priced"; readonly row: UsageEventRow }
    | { readonly kind: "unpriced"; readonly provider: string; readonly model: string };

export async function ingestEventsUseCase(input: IngestEventsInput): Promise<IngestSummary> {
    if (input.events.length === 0) {
        return { inserted: 0, billable: 0, unpriced: [] };
    }

    const resolver =
        input.pricingResolver ?? createDrizzlePricingResolver({ pricingRepo: input.pricingRepo });

    const resolved: ResolvedEvent[] = await Promise.all(
        input.events.map(async (event): Promise<ResolvedEvent> => {
            // Failed calls carry no tokens and no cost. Skip pricing entirely
            // (an unpriced model must not drop the failure) and persist as
            // `status='errored'`, which every spend/calls read excludes.
            if (event.errored === true) {
                return { kind: "priced", row: erroredUsageEventRow(input.workspaceId, event) };
            }
            try {
                const cost = await resolver.resolveCost({
                    workspaceId: input.workspaceId,
                    usage: {
                        promptTokens: event.promptTokens,
                        completionTokens: event.completionTokens,
                        cacheTokens: event.cacheTokens,
                        cacheWriteTokens: event.cacheWriteTokens ?? 0,
                        cacheWrite1hTokens: event.cacheWrite1hTokens ?? 0,
                        batch: event.batch ?? false,
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

    // Drop retried `requestId`s before the sink, then bill the bundle by what
    // actually persists, never the requested count (issue #1002). Rows without
    // a `requestId` can't dedup and always land.
    const toInsert = await dedupeRows(rows, input.dedup);
    const inserted = toInsert.length > 0 ? await input.eventsRepo.insertBatch(toInsert) : 0;
    const billable = toInsert.filter((row) => row.status !== "errored").length;

    return { inserted, billable, unpriced: [...unpriced.values()] };
}

/**
 * Keeps every null-`requestId` row plus the first row per
 * `(workspaceId, requestId)` the guard reports as unseen in the idempotency
 * window. Order is preserved; within-batch repeats collapse to one.
 */
async function dedupeRows(
    rows: readonly UsageEventRow[],
    dedup: RequestDedupGuard,
): Promise<UsageEventRow[]> {
    const keys = rows.flatMap((row) =>
        row.requestId === null ? [] : [dedupKey(row.workspaceId, row.requestId)],
    );
    const fresh = await dedup.keepUnseen(keys);

    const used = new Set<string>();
    const out: UsageEventRow[] = [];
    for (const row of rows) {
        if (row.requestId === null) {
            out.push(row);
            continue;
        }
        const key = dedupKey(row.workspaceId, row.requestId);
        if (fresh.has(key) && !used.has(key)) {
            used.add(key);
            out.push(row);
        }
    }
    return out;
}
