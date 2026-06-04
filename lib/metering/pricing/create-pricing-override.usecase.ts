/**
 * Create pricing override use case.
 *
 * Inserts a workspace-scoped pricing row. The row carries the caller's
 * `workspaceId`, so the lookup path (`findPricingRow`) prefers it over the
 * matching global row within `[effectiveFrom, effectiveTo)`.
 *
 * Validation surfaces readable errors before Postgres rejects the row:
 *   - rates must parse as non-negative numbers (mirrors the column CHECK)
 *   - effectiveTo (when set) must be strictly after effectiveFrom
 */

import type { PricingRepository, PricingRow } from "./pricing-row";
import { assertPricingInput } from "./validate-pricing-input";

export interface CreatePricingOverrideInput {
    readonly pricing: PricingRepository;
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

export async function createPricingOverride(
    input: CreatePricingOverrideInput,
): Promise<PricingRow> {
    assertPricingInput(input);

    return input.pricing.insertOverride({
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
}
