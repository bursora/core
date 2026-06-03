/**
 * Alerts page at `/workspace/[workspaceId]/alerts` (server component).
 *
 * Reads URL params:
 *   path  /workspace/<id>/alerts          workspace from path
 *   &tenant_id=csv                        optional tenant filter (multi)
 *   &agent_id=csv                         optional agent filter (multi)
 *   &from=iso8601 &to=iso8601             optional window; defaults to last 24h
 *
 * Membership is guarded by the parent workspace layout. Renders rows
 * newest first or an empty state.
 */

import { CloudPaywallPage } from "@/app/(dashboard)/workspace/[workspaceId]/_components/cloud-paywall-page";
import { resolveSpendWindow } from "@/app/(dashboard)/workspace/[workspaceId]/spend/_lib/resolve-window";
import { PageHeader } from "@/components/shell/page-header";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { DateRangeFilter } from "@/components/ui/workspace/filters/date-range-filter";
import { MeteringActiveFilters } from "@/components/ui/workspace/filters/metering-active-filters";
import { StatTile } from "@/components/ui/workspace/stat-tile";
import { cloudWorkspaceLocked } from "@/lib/billing-gate/server";
import type { Alert } from "@/lib/detection";
import { listAlerts } from "@/lib/detection";
import { listDistinctMeteringValuesBulk } from "@/lib/metering/server";
import { readParam, readParamList } from "@/lib/search-params";
import { getRequestTimeZone } from "@/lib/time/request-tz";
import { AlertRow } from "./_components/alert-row";

interface AlertsPageProps {
    params: Promise<{ workspaceId: string }>;
    searchParams: Promise<{
        tenant_id?: string;
        agent_id?: string;
        from?: string;
        to?: string;
    }>;
}

export default async function AlertsPage({ params, searchParams }: AlertsPageProps) {
    const { workspaceId } = await params;

    // Secure gate: bail before listing alerts so a locked cloud workspace never
    // has its anomaly or budget-block history fetched.
    if (await cloudWorkspaceLocked(workspaceId)) {
        return (
            <CloudPaywallPage
                workspaceId={workspaceId}
                title="Alerts"
                subtitle="Spend spikes and budget blocks across tenants and agents."
            />
        );
    }

    const search = await searchParams;
    const tz = await getRequestTimeZone();

    const { from, to } = resolveSpendWindow({
        from: readParam(search.from),
        to: readParam(search.to),
        now: new Date(),
        tz,
    });

    const tenantId = readParamList(search.tenant_id);
    const agentId = readParamList(search.agent_id);

    const [optionsByScope, rows] = await Promise.all([
        listDistinctMeteringValuesBulk({ workspaceId, scopes: ["tenant", "agent"] }),
        listAlerts({ workspaceId, from, to, tenantId, agentId }),
    ]);

    const anomalyCount = rows.filter((r) => r.kind === "anomaly").length;
    const budgetCount = rows.length - anomalyCount;
    const critical = rows.filter((r) => r.severity === "critical").length;

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title="Alerts"
                subtitle="Spend spikes and budget blocks across tenants and agents."
            />

            <div className="flex flex-wrap items-center gap-2">
                <MeteringActiveFilters
                    optionsByScope={optionsByScope}
                    keys={["tenant_id", "agent_id"]}
                />
                <DateRangeFilter from={from} to={to} />
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatTile label="Total alerts" value={rows.length} tone="foreground" />
                <StatTile
                    label="Anomalies"
                    value={anomalyCount}
                    tone={anomalyCount === 0 ? "muted" : "foreground"}
                    hint={anomalyCount === 0 ? "none raised" : "spend spikes"}
                />
                <StatTile
                    label="Budget blocks"
                    value={budgetCount}
                    tone={budgetCount === 0 ? "muted" : "destructive"}
                    hint={budgetCount === 0 ? "none raised" : "caps tripped"}
                />
                <StatTile
                    label="Critical"
                    value={critical}
                    tone={critical === 0 ? "muted" : "destructive"}
                    hint={critical === 0 ? "none raised" : "severity: critical"}
                />
            </div>

            <DashboardSection label="Recent alerts" sublabel="newest first" bodyClassName="-mx-5">
                {rows.length === 0 ? (
                    <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                        No alerts in this window - your agents are behaving.
                    </p>
                ) : (
                    <ul className="divide-y divide-border/60">
                        {rows.map((alert) => (
                            <li key={alertKey(alert)}>
                                <AlertRow workspaceId={workspaceId} alert={alert} tz={tz} />
                            </li>
                        ))}
                    </ul>
                )}
            </DashboardSection>
        </section>
    );
}

function alertKey(alert: Alert): string {
    const iso = alert.raisedAt.toISOString();
    if (alert.kind === "budget") {
        return `budget:${alert.budgetId}:${iso}`;
    }
    return `anomaly:${iso}:${alert.scope.tenantId ?? ""}:${alert.scope.agentId ?? ""}:${alert.reason}`;
}
