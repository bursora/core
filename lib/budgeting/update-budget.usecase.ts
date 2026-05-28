/**
 * updateBudget — partial update for a budget row, scoped by workspace.
 *
 * The repo enforces workspace isolation via `WHERE id = ? AND workspace_id =
 * ?`. The use case validates the patch against `BudgetInputSchema` by
 * merging the patch onto the existing row and parsing the result, so the
 * resulting combination satisfies the same rules as create.
 *
 * Returns the updated row, or `null` when the id is unknown or the row
 * belongs to another workspace. The use case does NOT distinguish the two
 * cases — the dashboard treats both as "not found" so foreign rows do not
 * leak via timing or messaging.
 */

import type { BudgetMode, ScopeType } from "./budget";
import { BudgetInputSchema } from "./budget-input.schema";
import type { BudgetRepository, RawBudget, UpdateBudgetInput } from "./budget.repository";
import type { Period } from "./period";
import { ValidationError } from "./validation-error";

export interface UpdateBudgetUseCaseInput {
    readonly id: string;
    readonly workspaceId: string;
    readonly patch: UpdateBudgetPatch;
    readonly budgets: BudgetRepository;
}

export interface UpdateBudgetPatch {
    readonly scopeType?: ScopeType;
    readonly scopeId?: string | null;
    readonly period?: Period;
    readonly amountUsd?: string;
    readonly mode?: BudgetMode;
}

export async function updateBudgetUseCase(
    input: UpdateBudgetUseCaseInput,
): Promise<RawBudget | null> {
    const existing = await input.budgets.findById(input.id, input.workspaceId);
    if (existing === null) return null;

    const patch = input.patch;
    const merged = {
        scopeType: patch.scopeType !== undefined ? patch.scopeType : existing.scopeType,
        scopeId: patch.scopeId !== undefined ? patch.scopeId : existing.scopeId,
        period: patch.period !== undefined ? patch.period : existing.period,
        mode: patch.mode !== undefined ? patch.mode : existing.mode,
        amountUsd: patch.amountUsd !== undefined ? patch.amountUsd : existing.amountUsd,
    };

    // Validate the merged row, but only enforce issues on fields this patch
    // actually changes. A legacy-invalid scopeType/scopeId pairing on the
    // stored row must not veto an edit to an unrelated field. Scope is a pair:
    // the pair-check reports on `scopeId`, so patching either scope field makes
    // both scope paths relevant.
    const parsed = BudgetInputSchema.safeParse(merged);
    if (!parsed.success) {
        const scopeTouched = patch.scopeType !== undefined || patch.scopeId !== undefined;
        const relevant = new Set<string>();
        if (patch.amountUsd !== undefined) relevant.add("amountUsd");
        if (patch.period !== undefined) relevant.add("period");
        if (patch.mode !== undefined) relevant.add("mode");
        if (scopeTouched) {
            relevant.add("scopeType");
            relevant.add("scopeId");
        }
        const blocking = parsed.error.issues.filter((issue) => {
            const field = issue.path[0];
            return typeof field === "string" && relevant.has(field);
        });
        const first = blocking[0];
        if (first !== undefined) {
            const field = typeof first.path[0] === "string" ? first.path[0] : "";
            throw new ValidationError(field, first.message, blocking);
        }
    }

    const repoPatch: UpdateBudgetInput = {
        ...(patch.scopeType !== undefined ? { scopeType: patch.scopeType } : {}),
        ...(patch.scopeId !== undefined ? { scopeId: patch.scopeId } : {}),
        ...(patch.period !== undefined ? { period: patch.period } : {}),
        ...(patch.amountUsd !== undefined ? { amountUsd: patch.amountUsd } : {}),
        ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
    };

    return input.budgets.update(input.id, input.workspaceId, repoPatch);
}
