/**
 * updateBudget — partial update for a budget row, scoped by workspace.
 *
 * The repo enforces workspace isolation via `WHERE id = ? AND workspace_id =
 * ?`. The use case adds validation per field present in the patch and a
 * pair-check on (scopeType, scopeId) when either changes — the resulting
 * combination must satisfy the same rules as create.
 *
 * Returns the updated row, or `null` when the id is unknown or the row
 * belongs to another workspace. The use case does NOT distinguish the two
 * cases — the dashboard treats both as "not found" so foreign rows do not
 * leak via timing or messaging.
 */

import type { BudgetMode, ScopeType } from "./budget";
import type { BudgetRepository, RawBudget, UpdateBudgetInput } from "./budget.repository";
import {
    validateAmount,
    validateMode,
    validatePeriod,
    validateScopeId,
    validateScopeType,
} from "./create-budget.usecase";
import type { Period } from "./period";

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
    const patch = input.patch;

    if (patch.scopeType !== undefined) validateScopeType(patch.scopeType);
    if (patch.period !== undefined) validatePeriod(patch.period);
    if (patch.mode !== undefined) validateMode(patch.mode);
    if (patch.amountUsd !== undefined) validateAmount(patch.amountUsd);

    if (patch.scopeType !== undefined || patch.scopeId !== undefined) {
        const existing = await loadOwnRow(input);
        if (existing === null) return null;
        const effectiveScopeType =
            patch.scopeType !== undefined ? patch.scopeType : existing.scopeType;
        const effectiveScopeId = patch.scopeId !== undefined ? patch.scopeId : existing.scopeId;
        validateScopeId(effectiveScopeType, effectiveScopeId);
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

async function loadOwnRow(input: UpdateBudgetUseCaseInput): Promise<RawBudget | null> {
    const rows = await input.budgets.listByWorkspace(input.workspaceId);
    return rows.find((r) => r.id === input.id) ?? null;
}
