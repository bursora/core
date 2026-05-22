/**
 * Update pricing override use case. Mirrors create: rates must parse as
 * non-negative; `effectiveTo` (when set) must be strictly after
 * `effectiveFrom`. The repo scopes the update by `workspaceId` so callers
 * cannot mutate another workspace's row.
 */

import type { PricingRepository, PricingRow } from "./pricing-row";
import { assertEffectiveWindow, assertNonNegativeRate } from "./validate-pricing-input";

export interface UpdatePricingOverrideInput {
    readonly pricing: PricingRepository;
    readonly id: string;
    readonly workspaceId: string;
    readonly provider: string;
    readonly model: string;
    readonly region: string;
    readonly inputPer1mUsd: string;
    readonly outputPer1mUsd: string;
    readonly cachePer1mUsd: string | null;
    readonly effectiveFrom: Date;
    readonly effectiveTo: Date | null;
}

export async function updatePricingOverride(
    input: UpdatePricingOverrideInput,
): Promise<PricingRow> {
    assertNonNegativeRate("inputPer1mUsd", input.inputPer1mUsd);
    assertNonNegativeRate("outputPer1mUsd", input.outputPer1mUsd);
    if (input.cachePer1mUsd !== null) {
        assertNonNegativeRate("cachePer1mUsd", input.cachePer1mUsd);
    }
    assertEffectiveWindow(input.effectiveFrom, input.effectiveTo);

    const updated = await input.pricing.updateOverride({
        id: input.id,
        workspaceId: input.workspaceId,
        row: {
            provider: input.provider,
            model: input.model,
            region: input.region,
            inputPer1mUsd: input.inputPer1mUsd,
            outputPer1mUsd: input.outputPer1mUsd,
            cachePer1mUsd: input.cachePer1mUsd,
            effectiveFrom: input.effectiveFrom,
        },
        effectiveTo: input.effectiveTo,
    });
    if (updated === null) {
        throw new Error("pricing override not found");
    }
    return updated;
}
