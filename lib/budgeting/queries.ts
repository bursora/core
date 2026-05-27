/**
 * Read-side helpers for the budgeting feature.
 *
 * Pages call `listBudgets` to render the dashboard list; the SDK route calls
 * `decideBudget` (from `./decide`) for the live decision read path. The
 * `listBudgetsUseCase` form is exposed for tests that wire in their own
 * repo fake.
 */

export type { BudgetStats } from "./server";

export { listBudgetsUseCase, type ListBudgetsInput } from "./list-budgets.usecase";

export type {
    BudgetListFilter,
    BudgetRepository,
    BudgetScopeQuery,
    CreateBudgetInput,
    RawBudget,
    UpdateBudgetInput,
} from "./budget.repository";
