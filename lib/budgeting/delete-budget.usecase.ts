/**
 * deleteBudget — removes a budget row scoped to the caller's workspace.
 *
 * Returns `true` when a row was deleted. Returns `false` when the id is
 * unknown or belongs to another workspace; the dashboard surfaces both as
 * "not found" so foreign rows do not leak.
 */

import type { BudgetRepository } from "./budget.repository";

export interface DeleteBudgetUseCaseInput {
    readonly id: string;
    readonly workspaceId: string;
    readonly budgets: BudgetRepository;
}

export async function deleteBudgetUseCase(input: DeleteBudgetUseCaseInput): Promise<boolean> {
    return input.budgets.delete(input.id, input.workspaceId);
}
