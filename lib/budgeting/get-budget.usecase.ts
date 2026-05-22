import type { BudgetRepository, RawBudget } from "./budget.repository";

export interface GetBudgetUseCaseInput {
    readonly id: string;
    readonly workspaceId: string;
    readonly budgets: BudgetRepository;
}

export async function getBudgetUseCase(input: GetBudgetUseCaseInput): Promise<RawBudget | null> {
    return input.budgets.findById(input.id, input.workspaceId);
}
