/**
 * lookupPricingRow — orchestrator that wraps the pricing repo + the pure
 * `findPricingRow` helper.
 *
 * Used by the metering ingest path. Given a usage event's
 * (provider, model, region, ts) and the caller's workspace, fetch the
 * candidate rows (workspace-scoped overrides + global rows) from the repo and
 * delegate selection to the pure helper.
 *
 * Returns null when no row applies — the metering use case treats this as a
 * "pricing_missing" condition and stores cost_usd = 0.
 */

import { findPricingRow } from "./find-pricing-row";
import type { PricingRepository, PricingRow } from "./pricing-row";

export interface LookupPricingRowInput {
    readonly provider: string;
    readonly model: string;
    readonly region: string;
    readonly ts: Date;
    readonly workspaceId: string;
    readonly pricing: PricingRepository;
}

export async function lookupPricingRowUseCase(
    input: LookupPricingRowInput,
): Promise<PricingRow | null> {
    const candidates = await input.pricing.findCandidatesForLookup({
        provider: input.provider,
        model: input.model,
        region: input.region,
        workspaceId: input.workspaceId,
    });
    return findPricingRow({
        candidates,
        provider: input.provider,
        model: input.model,
        region: input.region,
        ts: input.ts,
        workspaceId: input.workspaceId,
    });
}
