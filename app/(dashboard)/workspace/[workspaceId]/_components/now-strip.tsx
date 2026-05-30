import { NowStripView } from "@/components/ui/dashboard-views/now-strip-view";
import type { KpiTone } from "@/components/ui/kpi";
import { BUDGET_USAGE_WARN_THRESHOLD } from "@/lib/budgeting";
import type { DashboardWindow } from "@/lib/dashboard-window";
import {
    countActiveBudgets,
    getBudgetHeadroom,
    getCallsDelta,
    getCallsInWindow,
    getCallsSeries,
    getSpendDelta,
    getSpendInWindow,
    getSpendSeries,
} from "@/lib/dashboard/dashboard-stats";
import { listAlerts } from "@/lib/detection";
import { formatCount } from "@/lib/format";

interface NowStripProps {
    readonly workspaceId: string;
    readonly dashboardWindow: DashboardWindow;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HEADROOM_LIMIT = 50;
const AT_RISK_PCT_LABEL = `${Math.round(BUDGET_USAGE_WARN_THRESHOLD * 100)}%+`;

export async function NowStrip({ workspaceId, dashboardWindow }: NowStripProps) {
    const { from, to, priorFrom, priorTo, label } = dashboardWindow;
    const since24h = new Date(to.getTime() - DAY_MS);
    const suffix = label.toLowerCase();

    const [
        spendTotal,
        callsCount,
        callsDelta,
        spendDelta,
        spendSeries,
        callsSeries,
        activeBudgets,
        headroom,
        recentAlerts,
    ] = await Promise.all([
        getSpendInWindow({ workspaceId, from, to }),
        getCallsInWindow({ workspaceId, from, to }),
        getCallsDelta({ workspaceId, from, to, priorFrom, priorTo }),
        getSpendDelta({ workspaceId, from, to, priorFrom, priorTo }),
        getSpendSeries({ workspaceId, from, to }),
        getCallsSeries({ workspaceId, from, to }),
        countActiveBudgets(workspaceId),
        getBudgetHeadroom({ workspaceId, limit: HEADROOM_LIMIT, now: to }),
        listAlerts({ workspaceId, from: since24h, to }),
    ]);

    const atRisk = headroom.filter((r) => r.usage >= BUDGET_USAGE_WARN_THRESHOLD).length;
    const critical = recentAlerts.filter((a) => a.severity === "critical").length;
    const warning = recentAlerts.filter((a) => a.severity === "warning").length;
    const alerts24h = recentAlerts.length;

    const budgetsDeltaLabel =
        atRisk === 0
            ? `none at ${AT_RISK_PCT_LABEL}`
            : `${formatCount(atRisk)} at ${AT_RISK_PCT_LABEL}`;
    const budgetsTone: KpiTone = atRisk > 0 ? "up" : "neut";

    const alertsDeltaLabel =
        critical === 0 && warning === 0
            ? "none raised"
            : `${formatCount(critical)} critical · ${formatCount(warning)} warning`;
    const alertsTone: KpiTone = critical > 0 ? "up" : "neut";

    return (
        <NowStripView
            suffix={suffix}
            deltaCaption={`vs prior ${suffix}`}
            spend={{ total: spendTotal, delta: spendDelta, series: spendSeries }}
            calls={{ count: callsCount, delta: callsDelta, series: callsSeries }}
            budgets={{ active: activeBudgets, deltaLabel: budgetsDeltaLabel, tone: budgetsTone }}
            alerts={{ total24h: alerts24h, deltaLabel: alertsDeltaLabel, tone: alertsTone }}
        />
    );
}
