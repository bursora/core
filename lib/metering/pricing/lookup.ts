/**
 * lookup — pricing feature's public read entry point.
 *
 * Given (provider, model, region, ts) and the caller's workspace, fetches the
 * candidate rows from the repository and delegates row selection to the pure
 * `findPricingRow` helper. Returns null when no rule applies — the caller
 * (metering's cost-calc path) translates this into an `UnknownPricingError`
 * so the route renders 400 `pricing_unknown`.
 */

import { lookupPricingRowUseCase } from "./lookup-pricing-row.usecase";
import type { PricingRepository, PricingRow } from "./pricing-row";

export interface LookupInput {
    readonly pricing: PricingRepository;
    readonly provider: string;
    readonly model: string;
    readonly region: string;
    readonly ts: Date;
    readonly workspaceId: string;
}

export function lookup(input: LookupInput): Promise<PricingRow | null> {
    return lookupPricingRowUseCase(input);
}
