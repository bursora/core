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
    const existing = await loadOwnRow(input);
    if (existing === null) return null;

    const patch = input.patch;
    const merged = {
        scopeType: patch.scopeType !== undefined ? patch.scopeType : existing.scopeType,
        scopeId: patch.scopeId !== undefined ? patch.scopeId : existing.scopeId,
        period: patch.period !== undefined ? patch.period : existing.period,
        mode: patch.mode !== undefined ? patch.mode : existing.mode,
        amountUsd: patch.amountUsd !== undefined ? patch.amountUsd : existing.amountUsd,
    };

    const parsed = BudgetInputSchema.safeParse(merged);
    if (!parsed.success) {
        throw ValidationError.fromZodError(parsed.error);
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
