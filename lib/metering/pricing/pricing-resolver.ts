/**
 * PricingResolver — the seam that represents "the pricing decision for this
 * event."
 *
 * Ingest used to weave three modules inline: lookup row → find row → calculate
 * cost. That orchestration leaked through the use case and made it awkward to
 * swap the pricing source for tests. The resolver collapses all three into
 * one call so callers ask one question — "what does this cost?" — and tests
 * can answer with a hardcoded Money.
 *
 * The default Drizzle implementation keeps using the existing trio:
 *   lookupPricingRowUseCase → findPricingRow (inside lookup) → calculateCost.
 * It memoizes lookups by (provider, model, region, ts-bucket-day) so a batch
 * touching 3 unique models issues 3 repository hits, not 100 — preserving the
 * grouping the inline ingest path used to do by hand.
 *
 * On a missing pricing row the resolver raises `UnknownPricingError` carrying
 * the offending provider/model so the route handler can surface a 400
 * `pricing_unknown` response without re-deriving context (see issue #915).
 */

import { calculateCost, UnknownPricingError, type Usage } from "./calculate-cost";
import { lookup as lookupPricingRow } from "./lookup";
import type { Money } from "./money";
import type { PricingRepository, PricingRow } from "./pricing-row";

export interface PricingResolverInput {
    readonly workspaceId: string;
    readonly usage: Usage;
    readonly provider: string;
    readonly model: string;
    readonly region: string;
    readonly ts: Date;
}

export interface PricingResolver {
    resolveCost(input: PricingResolverInput): Promise<Money>;
}

export interface DrizzlePricingResolverDeps {
    readonly pricingRepo: PricingRepository;
}

export function createDrizzlePricingResolver(deps: DrizzlePricingResolverDeps): PricingResolver {
    const cache = new Map<string, Promise<PricingRow | null>>();

    const lookupCached = (input: PricingResolverInput): Promise<PricingRow | null> => {
        const key = `${input.provider}|${input.model}|${input.region}|${tsBucket(input.ts)}|${input.workspaceId}`;
        const existing = cache.get(key);
        if (existing !== undefined) return existing;
        const promise = lookupPricingRow({
            pricing: deps.pricingRepo,
            provider: input.provider,
            model: input.model,
            region: input.region,
            ts: input.ts,
            workspaceId: input.workspaceId,
        });
        cache.set(key, promise);
        return promise;
    };

    return {
        async resolveCost(input) {
            const row = await lookupCached(input);
            try {
                return calculateCost(input.usage, row);
            } catch (err) {
                if (err instanceof UnknownPricingError) {
                    throw new UnknownPricingError({
                        provider: input.provider,
                        model: input.model,
                    });
                }
                throw err;
            }
        },
    };
}

const tsBucket = (ts: Date): string => ts.toISOString().slice(0, 10);
