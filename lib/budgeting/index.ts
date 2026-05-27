/**
 * Public API of the budgeting feature.
 *
 * Consumers in `app/` and other features import everything they need from
 * here: the `budgets` table, the pure `evaluateBudget` deep module, the
 * `decideBudget` use case, read-side queries, and create/update/delete
 * server actions.
 */

export { decideBudgetUseCase, type DecideBudgetInput } from "./decide-budget.usecase";
export type { BudgetingDeps } from "./server";
export type { SpendAggregator, SpendAggregatorQuery } from "./spend-aggregator";

export { evaluateBudget } from "./evaluate-budget";
export type { BudgetTrigger, EvaluateBudgetOptions, EvaluateOutcome } from "./evaluate-budget";
export { periodWindow } from "./period";
export type { PeriodWindow } from "./period";
export { spendKey } from "./spend-snapshot";
export type { Spend } from "./spend-snapshot";

export * from "./queries";

export {
    ValidationError,
    createBudgetUseCase,
    validateAmount,
    validateMode,
    validatePeriod,
    validateScopeId,
    validateScopeType,
    type CreateBudgetUseCaseInput,
} from "./create-budget.usecase";
export {
    updateBudgetUseCase,
    type UpdateBudgetPatch,
    type UpdateBudgetUseCaseInput,
} from "./update-budget.usecase";

export { MODES, SCOPE_TYPES, type BudgetMode, type Decision, type ScopeType } from "./budget";
export { PERIODS, type Period } from "./period";

export type { Budget } from "./budget";
export type { BudgetListFilter, RawBudget } from "./budget.repository";

export {
    optimisticReducer,
    pendingRowClass,
    type OptimisticAction,
    type OptimisticItem,
    type PendingState,
} from "./optimistic-list";

export { buildBudgetDetailView, type BudgetDetailView } from "./budget-detail-view";

export { ETA_SOON_DAYS, ETA_URGENT_DAYS, formatEtaHint } from "./eta-format";
export {
    BUDGET_USAGE_DANGER_THRESHOLD,
    BUDGET_USAGE_WARN_THRESHOLD,
    budgetUsageBarTone,
    budgetUsageTextTone,
} from "./usage-tone";
export { computeWhatsBreaking, type WhatsBreakingRow } from "./whats-breaking";

export { projectEndOfPeriod } from "./projection";
export { buildBudgetSpendHref } from "./spend-href";
