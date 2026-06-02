// Trajectories-to-Watch loaders. Issue two equal-length aggregations per
// facet (current + prior) and apply the legacy detector thresholds (>=2x
// customer ratio, >+15pp model share AND >1.5x cpc). `today` is skipped:
// partial-day data is too noisy to flag a sustained trajectory.

import { periodWindow, type Period, type RawBudget } from "@/lib/budgeting";
import type { DashboardWindow } from "@/lib/dashboard-window";
import { getBudgetList } from "@/lib/dashboard/dashboard-stats";
import type { FacetedSeries } from "@/lib/metering";
import { getSpendSeries } from "@/lib/metering/server";
import "server-only";

export interface CustomerTrajectory {
    readonly tenantId: string;
    readonly ratio: number;
    readonly etaDate: Date;
    /** Identifier of the tenant-scope budget the projected pace would breach. */
    readonly budgetId: string;
    /** Period of that budget, used by the dashboard to label the row. */
    readonly budgetPeriod: Period;
}

export interface ModelTrajectory {
    readonly model: string;
    readonly shareNow: number;
    readonly sharePrior: number;
    readonly cpcRatio: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const CUSTOMER_RATIO_THRESHOLD = 2.0;
const CUSTOMER_FORECAST_HORIZON_DAYS = 7;

const MODEL_SHARE_DELTA_THRESHOLD = 0.15;
const MODEL_CPC_RATIO_THRESHOLD = 1.5;

interface SpendCallsByTag {
    readonly costByTag: Map<string, number>;
    readonly callsByTag: Map<string, number>;
    readonly totalCost: number;
}

function foldByTag(series: FacetedSeries): SpendCallsByTag {
    const costByTag = new Map<string, number>();
    const callsByTag = new Map<string, number>();
    let totalCost = 0;
    for (const p of series.points) {
        const cost = Number.parseFloat(p.costUsd);
        if (Number.isFinite(cost)) {
            costByTag.set(p.tag, (costByTag.get(p.tag) ?? 0) + cost);
            totalCost += cost;
        }
        if (Number.isFinite(p.callCount)) {
            callsByTag.set(p.tag, (callsByTag.get(p.tag) ?? 0) + p.callCount);
        }
    }
    return { costByTag, callsByTag, totalCost };
}

/**
 * Project the date at which a tenant's running spend would cross the
 * budget cap, given the current daily rate. Returns null when the cap is
 * non-positive or the rate is zero.
 */
function projectBreachDate(input: {
    readonly budget: RawBudget;
    readonly tenantDailyRate: number;
    readonly now: Date;
    readonly windowFrom: Date;
}): Date | null {
    const cap = Number.parseFloat(input.budget.amountUsd);
    if (!Number.isFinite(cap) || cap <= 0) return null;
    if (input.tenantDailyRate <= 0) return null;

    const period = periodWindow(input.budget.period, input.now);
    const startMs = Math.max(period.from.getTime(), input.windowFrom.getTime());
    const eta = startMs + (cap / input.tenantDailyRate) * MS_PER_DAY;
    return eta <= input.now.getTime() ? input.now : new Date(eta);
}

export async function getCustomerTrajectories(input: {
    readonly workspaceId: string;
    readonly window: DashboardWindow;
}): Promise<readonly CustomerTrajectory[]> {
    // A window of a day or less is too short to project a customer trajectory;
    // skip rather than extrapolate from a single day of spend.
    if (input.window.to.getTime() - input.window.from.getTime() < 2 * MS_PER_DAY) return [];

    const { window, workspaceId } = input;
    const [currentSeries, priorSeries, budgets] = await Promise.all([
        getSpendSeries({
            workspaceId,
            facet: "tenant",
            from: window.from,
            to: window.to,
        }),
        getSpendSeries({
            workspaceId,
            facet: "tenant",
            from: window.priorFrom,
            to: window.priorTo,
        }),
        getBudgetList(workspaceId),
    ]);

    const current = foldByTag(currentSeries);
    const prior = foldByTag(priorSeries);

    const currentDays = (window.to.getTime() - window.from.getTime()) / MS_PER_DAY;
    const out: CustomerTrajectory[] = [];
    const horizonEndMs = window.to.getTime() + CUSTOMER_FORECAST_HORIZON_DAYS * MS_PER_DAY;

    for (const [tenantId, currentSpend] of current.costByTag) {
        const priorSpend = prior.costByTag.get(tenantId) ?? 0;
        if (priorSpend <= 0) continue;

        // Equal-length windows post `today` skip, so totals compare like-for-like.
        const ratio = currentSpend / priorSpend;
        if (ratio < CUSTOMER_RATIO_THRESHOLD) continue;

        const currentRate = currentSpend / currentDays;
        const tenantBudgets = budgets.filter(
            (b) => b.scopeType === "tenant" && b.scopeId === tenantId,
        );
        for (const budget of tenantBudgets) {
            const eta = projectBreachDate({
                budget,
                tenantDailyRate: currentRate,
                now: window.to,
                windowFrom: window.from,
            });
            if (eta === null) continue;
            if (eta.getTime() > horizonEndMs) continue;
            out.push({
                tenantId,
                ratio,
                etaDate: eta,
                budgetId: budget.id,
                budgetPeriod: budget.period,
            });
        }
    }

    out.sort((a, b) => a.etaDate.getTime() - b.etaDate.getTime());
    return out;
}

export async function getModelTrajectories(input: {
    readonly workspaceId: string;
    readonly window: DashboardWindow;
}): Promise<readonly ModelTrajectory[]> {
    // Too short to project a trend; same guard as the customer trajectories.
    if (input.window.to.getTime() - input.window.from.getTime() < 2 * MS_PER_DAY) return [];

    const { window, workspaceId } = input;
    const [currentSeries, priorSeries] = await Promise.all([
        getSpendSeries({
            workspaceId,
            facet: "model",
            from: window.from,
            to: window.to,
        }),
        getSpendSeries({
            workspaceId,
            facet: "model",
            from: window.priorFrom,
            to: window.priorTo,
        }),
    ]);

    const current = foldByTag(currentSeries);
    const prior = foldByTag(priorSeries);
    if (current.totalCost === 0 || prior.totalCost === 0) return [];

    const models = new Set<string>([...current.costByTag.keys(), ...prior.costByTag.keys()]);
    const out: ModelTrajectory[] = [];

    for (const model of models) {
        const spendNow = current.costByTag.get(model) ?? 0;
        const spendPrior = prior.costByTag.get(model) ?? 0;
        const callsNow = current.callsByTag.get(model) ?? 0;
        const callsPrior = prior.callsByTag.get(model) ?? 0;

        if (spendNow === 0 || spendPrior === 0) continue;
        if (callsNow === 0 || callsPrior === 0) continue;

        const sharePrior = spendPrior / prior.totalCost;
        const shareNow = spendNow / current.totalCost;
        if (shareNow - sharePrior <= MODEL_SHARE_DELTA_THRESHOLD) continue;

        const cpcPrior = spendPrior / callsPrior;
        const cpcNow = spendNow / callsNow;
        if (cpcPrior === 0) continue;
        const cpcRatio = cpcNow / cpcPrior;
        if (cpcRatio <= MODEL_CPC_RATIO_THRESHOLD) continue;

        out.push({ model, shareNow, sharePrior, cpcRatio });
    }

    out.sort((a, b) => b.shareNow - b.sharePrior - (a.shareNow - a.sharePrior));
    return out;
}
