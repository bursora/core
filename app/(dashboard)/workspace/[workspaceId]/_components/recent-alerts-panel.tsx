/**
 * RecentAlertsPanel — 5 most recent alerts (anomaly + budget block) in the
 * last 24 hours. Loader: pulls alerts, maps them into view rows, hands off to
 * `RecentAlertsPanelView` for rendering.
 */

import {
    RecentAlertsPanelView,
    type RecentAlertsRow,
} from "@/components/ui/dashboard-views/recent-alerts-panel-view";
import { budgetAlertToEvent, listAlerts } from "@/lib/detection";
import { formatRelativeTime } from "@/lib/format";
import { formatBudgetAttribution } from "@/lib/notification";
import { buildWorkspacePath } from "@/lib/routes";

interface RecentAlertsPanelProps {
    readonly workspaceId: string;
}

export async function RecentAlertsPanel({ workspaceId }: RecentAlertsPanelProps) {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const alerts = await listAlerts({
        workspaceId,
        from: since,
        to: now,
        limit: 5,
    });

    const rows: readonly RecentAlertsRow[] = alerts.map((a) => ({
        key:
            a.kind === "budget"
                ? `budget:${a.budgetId}:${a.raisedAt.toISOString()}`
                : `anomaly:${a.raisedAt.toISOString()}:${a.scope.tenantId ?? ""}:${a.scope.agentId ?? ""}:${a.reason}`,
        timestamp: formatRelativeTime(a.raisedAt, now.getTime()),
        kind: a.severity === "critical" ? "block" : "warn",
        who:
            a.kind === "budget"
                ? (a.payload.scopeId ?? a.payload.scopeType)
                : (a.scope.tenantId ?? a.scope.agentId ?? "workspace"),
        label: a.kind === "budget" ? formatBudgetAttribution(budgetAlertToEvent(a)) : a.reason,
    }));

    return (
        <RecentAlertsPanelView
            rows={rows}
            viewAllHref={buildWorkspacePath(workspaceId, "alerts")}
        />
    );
}
