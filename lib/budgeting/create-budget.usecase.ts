/**
 * createBudget — validates dashboard form input, then persists.
 *
 * Validation invariants live in `BudgetInputSchema` so every ingress (server
 * action, future admin tool) shares the same rules. Use cases never trust
 * the caller — the SDK has read-only access to budgets, so writes always
 * come from this application layer with the calling user's `workspaceId`
 * already asserted.
 *
 * On invalid input throws `ValidationError` with the offending `field`.
 */

import type { BudgetMode, ScopeType } from "./budget";
import { BudgetInputSchema } from "./budget-input.schema";
import type { BudgetRepository, RawBudget } from "./budget.repository";
import type { Period } from "./period";
import { ValidationError } from "./validation-error";

export { ValidationError };

export interface CreateBudgetUseCaseInput {
    readonly workspaceId: string;
    readonly scopeType: ScopeType;
    readonly scopeId: string | null;
    readonly period: Period;
    readonly amountUsd: string;
    readonly mode: BudgetMode;
    readonly budgets: BudgetRepository;
}

export async function createBudgetUseCase(input: CreateBudgetUseCaseInput): Promise<RawBudget> {
    const parsed = BudgetInputSchema.safeParse({
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        period: input.period,
        mode: input.mode,
        amountUsd: input.amountUsd,
    });
    if (!parsed.success) {
        throw ValidationError.fromZodError(parsed.error);
    }

    return input.budgets.create({
        workspaceId: input.workspaceId,
        scopeType: parsed.data.scopeType,
        scopeId: parsed.data.scopeId,
        period: parsed.data.period,
        amountUsd: parsed.data.amountUsd,
        mode: parsed.data.mode,
    });
}
