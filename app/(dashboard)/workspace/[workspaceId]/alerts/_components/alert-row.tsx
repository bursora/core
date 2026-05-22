/**
 * AlertRow - server component for one alert in the /alerts feed.
 *
 * Branches on `alert.kind`:
 *   - anomaly: severity dot · scope tag · reason · window/$ chip · type chip ·
 *     raised time · trailing "View spend" link. Deep-link uses the alert's
 *     own window so the click lands on this anomaly, not the broader page
 *     window.
 *   - budget:  severity dot · attribution line · type chip · raised time ·
 *     trailing "View budget" link to the budget row anchor.
 */

import { Button } from "@/components/ui/button";
import { StatusTag } from "@/components/ui/workspace/status-tag";
import type { Alert, AnomalyAlert, BudgetAlert } from "@/lib/detection";
import { budgetAlertToEvent, buildSpendLink, flattenScope, scopeLabel } from "@/lib/detection";
import { formatPreciseUsd, formatRelativeTime, formatWindowRange } from "@/lib/format";
import { formatBudgetAttribution } from "@/lib/notification";
import { buildWorkspacePath } from "@/lib/routes";
import type { Route } from "next";
import Link from "next/link";
import { SeveritySign } from "./severity-sign";

interface AlertRowProps {
    workspaceId: string;
    alert: Alert;
}

export function AlertRow({ workspaceId, alert }: AlertRowProps) {
    if (alert.kind === "budget") {
        return <BudgetAlertRow workspaceId={workspaceId} alert={alert} />;
    }
    return <AnomalyRow workspaceId={workspaceId} alert={alert} />;
}

interface AnomalyRowProps {
    workspaceId: string;
    alert: AnomalyAlert;
}

function AnomalyRow({ workspaceId, alert }: AnomalyRowProps) {
    const scope = flattenScope(alert);
    const href = buildSpendLink(workspaceId, scope, alert.windowStart, alert.windowEnd);
    const iso = alert.raisedAt.toISOString();
    const relative = formatRelativeTime(alert.raisedAt);
    // Legacy rows persisted before the window-cost column existed have no
    // value; render the row without the chip rather than faking $0.00.
    const windowChip =
        alert.windowCostUsd === null
            ? null
            : `${formatPreciseUsd(alert.windowCostUsd)} in ${formatWindowRange(alert.windowStart, alert.windowEnd)}`;

    return (
        <div className="flex flex-row items-center gap-3 px-5 py-3">
            <SeveritySign severity={alert.severity} />

            <StatusTag tone="foreground" variant="pill">
                {scopeLabel(scope)}
            </StatusTag>

            <p className="min-w-0 flex-1 truncate text-sm text-foreground">{alert.reason}</p>

            {windowChip === null ? null : (
                <StatusTag tone="muted" variant="pill" className="hidden sm:inline-flex">
                    {windowChip}
                </StatusTag>
            )}

            <StatusTag tone="muted" variant="pill" className="hidden md:inline-flex">
                Anomaly
            </StatusTag>

            <time
                dateTime={iso}
                title={iso}
                className="hidden text-xs text-muted-foreground md:inline"
            >
                {relative}
            </time>

            <Button asChild variant="link" size="sm" className="h-auto p-0">
                <Link href={href}>View spend</Link>
            </Button>
        </div>
    );
}

interface BudgetAlertRowProps {
    workspaceId: string;
    alert: BudgetAlert;
}

function BudgetAlertRow({ workspaceId, alert }: BudgetAlertRowProps) {
    const iso = alert.raisedAt.toISOString();
    const relative = formatRelativeTime(alert.raisedAt);
    const attribution = formatBudgetAttribution(budgetAlertToEvent(alert));
    const href = `${buildWorkspacePath(workspaceId, "budgets")}#budget-${alert.budgetId}` as Route;

    return (
        <div className="flex flex-row items-center gap-3 px-5 py-3">
            <SeveritySign severity={alert.severity} />

            <p className="min-w-0 flex-1 truncate text-sm text-foreground">{attribution}</p>

            <StatusTag tone="muted" variant="pill" className="hidden md:inline-flex">
                Budget block
            </StatusTag>

            <time
                dateTime={iso}
                title={iso}
                className="hidden text-xs text-muted-foreground md:inline"
            >
                {relative}
            </time>

            <Button asChild variant="link" size="sm" className="h-auto p-0">
                <Link href={href}>View budget</Link>
            </Button>
        </div>
    );
}
