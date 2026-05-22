/**
 * Delete pricing override use case.
 *
 * Removes a workspace-scoped pricing row. The repo enforces that the row
 * matches both `id` and `workspaceId` — cross-workspace deletes return
 * false (no row removed). Global rows are never deletable here because the
 * repo filters on `workspace_id = $workspaceId`, which excludes NULL by
 * SQL's three-valued logic.
 */

import type { PricingRepository } from "./pricing-row";

export interface DeletePricingOverrideInput {
    readonly pricing: PricingRepository;
    readonly workspaceId: string;
    readonly id: string;
}

export async function deletePricingOverride(input: DeletePricingOverrideInput): Promise<boolean> {
    return input.pricing.deleteOverride({
        id: input.id,
        workspaceId: input.workspaceId,
    });
}
