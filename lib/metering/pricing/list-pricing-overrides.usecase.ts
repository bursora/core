/**
 * List pricing overrides use case.
 *
 * Returns workspace-scoped pricing rows for the caller's workspace. Global
 * rows (`workspace_id IS NULL`) are intentionally excluded — settings shows
 * only the rows the workspace controls.
 */

import type { PricingRepository, PricingRow } from "./pricing-row";

export interface ListPricingOverridesInput {
    readonly pricing: PricingRepository;
    readonly workspaceId: string;
}

export async function listPricingOverrides(
    input: ListPricingOverridesInput,
): Promise<readonly PricingRow[]> {
    return input.pricing.listOverridesByWorkspace(input.workspaceId);
}
