/**
 * listBudgets — lists every budget row in the caller's workspace.
 *
 * Workspace isolation is enforced by passing `workspaceId` straight to the
 * repository. The caller MUST derive `workspaceId` from the authenticated
 * session (via `assertWorkspaceMember`) — never trust a request body.
 *
 * Optional `filter` narrows to rows whose scope_type/scope_id match.
 */

import type { BudgetListFilter, BudgetRepository, RawBudget } from "./budget.repository";

export interface ListBudgetsInput {
    readonly workspaceId: string;
    readonly budgets: BudgetRepository;
    readonly filter?: BudgetListFilter | undefined;
}

export async function listBudgetsUseCase(input: ListBudgetsInput): Promise<readonly RawBudget[]> {
    return input.filter === undefined
        ? input.budgets.listByWorkspace(input.workspaceId)
        : input.budgets.listByWorkspace(input.workspaceId, input.filter);
}
