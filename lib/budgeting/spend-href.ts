import type { RawBudget } from "./budget.repository";
import type { BudgetStats } from "./server";
import { buildWorkspacePath } from "../routes";
import type { Route } from "next";

export function buildBudgetSpendHref(
    workspaceId: string,
    budget: RawBudget,
    stats: BudgetStats | undefined,
): Route {
    const query: Record<string, string> = {};
    if (stats !== undefined) {
        query.from = stats.periodFromIso;
        query.to = stats.periodToIso;
    }
    if (budget.scopeType !== "workspace" && budget.scopeId !== null) {
        query[`${budget.scopeType}_id`] = budget.scopeId;
    }
    return buildWorkspacePath(workspaceId, "spend", query);
}
