/**
 * decideBudget orchestrator — re-exported from the application layer.
 *
 * Reads applicable budgets, computes period windows, queries the spend
 * aggregator port (from metering), then runs `evaluateBudget`. Early-returns
 * on empty budgets without calling spend reads.
 */

export { decideBudgetUseCase, type DecideBudgetInput } from "./decide-budget.usecase";

export type { BudgetingDeps } from "./server";

export type { SpendAggregator, SpendAggregatorQuery } from "./spend-aggregator";
