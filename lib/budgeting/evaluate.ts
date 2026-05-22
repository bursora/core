/**
 * Pure `evaluateBudget` deep module — re-exported from the domain layer.
 *
 * No DB, no clock, no network. Given a spend snapshot and a list of budget
 * rows, returns an enforcement Decision. Severity precedence inside:
 * block > throttle > notify.
 */

export { evaluateBudget } from "./evaluate-budget";
export type { BudgetTrigger, EvaluateBudgetOptions, EvaluateOutcome } from "./evaluate-budget";
export { periodWindow } from "./period";
export type { PeriodWindow } from "./period";
export { spendKey } from "./spend-snapshot";
export type { Spend } from "./spend-snapshot";
