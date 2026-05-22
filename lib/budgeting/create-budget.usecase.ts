/**
 * createBudget — validates dashboard form input, then persists.
 *
 * Validation invariants live here so every ingress (server action, future
 * admin tool) shares the same rules. Use cases never trust the caller — the
 * SDK has read-only access to budgets, so writes always come from this
 * application layer with the calling user's `workspaceId` already asserted.
 *
 * On invalid input throws `ValidationError` with the offending `field`.
 */

import { MODES, SCOPE_TYPES, type BudgetMode, type ScopeType } from "./budget";
import type { BudgetRepository, RawBudget } from "./budget.repository";
import { PERIODS, type Period } from "./period";
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
    validateScopeType(input.scopeType);
    validatePeriod(input.period);
    validateMode(input.mode);
    validateAmount(input.amountUsd);
    validateScopeId(input.scopeType, input.scopeId);

    return input.budgets.create({
        workspaceId: input.workspaceId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        period: input.period,
        amountUsd: input.amountUsd,
        mode: input.mode,
    });
}

export function validateScopeType(value: unknown): asserts value is ScopeType {
    if (typeof value !== "string" || !(SCOPE_TYPES as readonly string[]).includes(value)) {
        throw new ValidationError(
            "scopeType",
            `scopeType must be one of: ${SCOPE_TYPES.join(", ")}`,
        );
    }
}

export function validatePeriod(value: unknown): asserts value is Period {
    if (typeof value !== "string" || !(PERIODS as readonly string[]).includes(value)) {
        throw new ValidationError("period", `period must be one of: ${PERIODS.join(", ")}`);
    }
}

export function validateMode(value: unknown): asserts value is BudgetMode {
    if (typeof value !== "string" || !(MODES as readonly string[]).includes(value)) {
        throw new ValidationError("mode", `mode must be one of: ${MODES.join(", ")}`);
    }
}

export function validateAmount(value: string): void {
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n) || n < 0) {
        throw new ValidationError("amountUsd", "amountUsd must be a non-negative number");
    }
}

export function validateScopeId(scopeType: ScopeType, scopeId: string | null): void {
    if (scopeType === "workspace") {
        if (scopeId !== null) {
            throw new ValidationError("scopeId", "workspace scope must have null scopeId");
        }
        return;
    }
    if (scopeId === null || scopeId.length === 0) {
        throw new ValidationError("scopeId", `${scopeType} scope requires a non-empty scopeId`);
    }
}
