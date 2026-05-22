import type { Route } from "next";
import type { RawBudget } from "./budget.repository";
import { projectEndOfPeriod } from "./projection";
import type { BudgetStats } from "./server";
import { buildBudgetSpendHref } from "./spend-href";

const SCOPE_LABEL: Record<RawBudget["scopeType"], string> = {
    workspace: "Workspace",
    tenant: "Tenant",
    agent: "Agent",
    workflow: "Workflow",
};

export interface BudgetDetailView {
    readonly title: string;
    readonly subtitle: string;
    readonly spendUsd: number;
    readonly capUsd: number;
    readonly ratio: number;
    readonly projectionUsd: number | null;
    readonly sparkline: readonly number[];
    readonly spendHref: Route;
}

export interface BuildBudgetDetailViewInput {
    readonly workspaceId: string;
    readonly budget: RawBudget;
    readonly stats: BudgetStats;
    readonly sparkline: readonly number[];
    readonly now?: Date;
}

export function buildBudgetDetailView(input: BuildBudgetDetailViewInput): BudgetDetailView {
    const { budget, stats, sparkline } = input;
    const parsedCap = Number.parseFloat(budget.amountUsd);
    const capUsd = Number.isFinite(parsedCap) && parsedCap > 0 ? parsedCap : 0;
    const spendUsd = stats.usedUsd;

    return {
        title: budget.scopeId ?? SCOPE_LABEL[budget.scopeType],
        subtitle: `${budget.period} · ${budget.mode}`,
        spendUsd,
        capUsd,
        ratio: capUsd > 0 ? spendUsd / capUsd : 0,
        projectionUsd: projectEndOfPeriod(stats, spendUsd, input.now ?? new Date()),
        sparkline,
        spendHref: buildBudgetSpendHref(input.workspaceId, budget, stats),
    };
}
