import { CloudPaywallPage } from "@/app/(dashboard)/workspace/[workspaceId]/_components/cloud-paywall-page";
import { PageHeader } from "@/components/shell/page-header";
import { TopSpendersTable } from "@/components/ui/dashboard-views/top-spenders-table";
import { FeedItem } from "@/components/ui/feed-item";
import { Kpi, type KpiTone } from "@/components/ui/kpi";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { DateRangeFilter } from "@/components/ui/workspace/filters/date-range-filter";
import { GroupByFilter } from "@/components/ui/workspace/filters/group-by-filter";
import { MeteringActiveFilters } from "@/components/ui/workspace/filters/metering-active-filters";
import { StatusFilter } from "@/components/ui/workspace/filters/status-filter";
import { StatusTag } from "@/components/ui/workspace/status-tag";
import { requireSessionUI } from "@/lib/auth";
import { cloudWorkspaceLocked } from "@/lib/billing-gate/server";
import { getBlockedCallsLastDay } from "@/lib/budgeting/blocked-calls";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { dashboardWindowFromRange, deltaWindows } from "@/lib/dashboard-window";
import { flattenScope, listAlerts } from "@/lib/detection";
import { formatCount, formatDate, formatPercent, formatUsd } from "@/lib/format";
import { UNTAGGED } from "@/lib/metering";
import {
    countEventsForWorkspace,
    getSpendSeries,
    getTopSpenders,
    listDistinctMeteringValuesBulk,
} from "@/lib/metering/server";
import { resolveModelProviders } from "@/lib/models-server";
import { buildWorkspacePath } from "@/lib/routes";
import { readMeteringFilters, readMeteringStatus, readParam } from "@/lib/search-params";
import { FACETS, FACET_LABEL, type Facet } from "@/lib/spend-types";
import { getRequestTimeZone } from "@/lib/time/request-tz";
import { formatInZone, zoneAbbrev } from "@/lib/time/zone";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { EmptyOnboarding } from "./_components/empty-onboarding";
import { SpendChart } from "./_components/spend-chart";
import { computePeakDay } from "./_lib/peak-day";
import { resolveSpendWindow } from "./_lib/resolve-window";

interface SpendPageProps {
    params: Promise<{ workspaceId: string }>;
    searchParams: Promise<{
        facet?: string;
        from?: string;
        to?: string;
        scope_id?: string;
        provider?: string;
        tenant_id?: string;
        agent_id?: string;
        workflow_id?: string;
        model?: string;
        status?: string;
    }>;
}

const TOP_LIMIT = 10;

export default async function SpendPage({ params, searchParams }: SpendPageProps) {
    const { workspaceId } = await params;

    // Secure gate: bail before reading searchParams or fetching any spend so a
    // locked cloud workspace never has its real numbers computed or sent down.
    if (await cloudWorkspaceLocked(workspaceId)) {
        return <CloudPaywallPage workspaceId={workspaceId} title="Spend" />;
    }

    const search = await searchParams;
    await requireSessionUI();

    const now = new Date();
    const tz = await getRequestTimeZone();
    const facet: Facet =
        search.facet !== undefined && (FACETS as readonly string[]).includes(search.facet)
            ? (search.facet as Facet)
            : "tenant";
    const { from, to } = resolveSpendWindow({
        from: search.from,
        to: search.to,
        now,
        tz,
    });
    const scopeId = readParam(search.scope_id);
    const filters = readMeteringFilters(search);
    const status = readMeteringStatus(search.status);
    const anyFilterActive = Object.values(filters).some((v) => v && v.length > 0);

    const prior = priorWindow(from, to, now);

    const [series, top, priorSeries, optionsByScope, anomalyAlerts, blockedCalls] =
        await Promise.all([
            getSpendSeries({ workspaceId, facet, from, to, scopeId, status, ...filters }),
            getTopSpenders({
                workspaceId,
                facet,
                from,
                to,
                limit: TOP_LIMIT,
                scopeId,
                status,
                ...filters,
            }),
            getSpendSeries({
                workspaceId,
                facet,
                from: prior.from,
                to: prior.to,
                scopeId,
                status,
                ...filters,
            }),
            // Always pass status='both' so blocked-only tags surface in the
            // filter dropdowns even when the user is viewing only ok rows.
            listDistinctMeteringValuesBulk({
                workspaceId,
                scopes: ["provider", "tenant", "agent", "workflow", "model"],
                status: "both",
            }),
            listAlerts({
                workspaceId,
                kind: "anomaly",
                from,
                to,
                limit: RECENT_ALERTS_LIMIT,
                tenantId: filters.tenantId,
                agentId: filters.agentId,
            }),
            getBlockedCallsLastDay({ ch: clickhouseClient(), workspaceId, now }),
        ]);

    const modelSlugs = new Set<string>();
    if (facet === "model") for (const r of top) modelSlugs.add(r.tag);
    for (const o of optionsByScope.model ?? []) modelSlugs.add(o.value);
    const modelProviders = await resolveModelProviders([...modelSlugs]);

    const showOnboarding =
        scopeId === undefined &&
        !anyFilterActive &&
        status === "ok" &&
        series.points.length === 0 &&
        top.length === 0 &&
        (await countEventsForWorkspace({ workspaceId })) === 0;

    const windowLabel = formatWindowSubtitle(from, to, tz);
    const windowLabelLower = windowLabel.toLowerCase();
    const subtitle = `${FACET_LABEL[facet]} · ${windowLabel}`;

    const totalUsd = Number.parseFloat(series.totalUsd);
    const priorTotalUsd = Number.parseFloat(priorSeries.totalUsd);
    const spendDelta = relativeDelta(totalUsd, priorTotalUsd);
    const callsDelta = relativeDelta(series.totalCalls, priorSeries.totalCalls);

    const spendBasePath = buildWorkspacePath(workspaceId, "spend");
    // Params preserved when the user clicks status segments or the blocked-calls KPI.
    const preservedParams: Record<string, string> = {
        facet,
        from: from.toISOString(),
        to: to.toISOString(),
    };
    if (scopeId !== undefined) preservedParams.scope_id = scopeId;
    for (const [k, v] of Object.entries(filters)) {
        if (v && v.length > 0) preservedParams[urlKeyForFilter(k)] = v.join(",");
    }
    const blockedKpiHref = buildWorkspacePath(workspaceId, "spend", {
        ...preservedParams,
        status: "blocked",
    });

    // Cost per call is only meaningful for cost-bearing ('ok') calls. Under a
    // blocked/both filter the call count includes zero-cost denied calls, which
    // would understate the true per-successful-call cost, so it reads "—".
    const perCall = status === "ok" && series.totalCalls > 0 ? totalUsd / series.totalCalls : null;
    const priorPerCall =
        status === "ok" && priorSeries.totalCalls > 0
            ? priorTotalUsd / priorSeries.totalCalls
            : null;
    const perCallDelta =
        perCall !== null && priorPerCall !== null ? relativeDelta(perCall, priorPerCall) : null;

    const peak = computePeakDay(series.points, tz);

    const untaggedShare = computeUntaggedShare(series.points, series.totalUsd);

    return (
        <section className="flex flex-col gap-6">
            <PageHeader title="Spend" subtitle={subtitle} />

            {showOnboarding ? (
                <EmptyOnboarding workspaceId={workspaceId} />
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <MeteringActiveFilters
                            optionsByScope={optionsByScope}
                            modelProviders={modelProviders}
                        />
                        <DateRangeFilter from={from} to={to} />
                        <StatusFilter
                            status={status}
                            basePath={spendBasePath}
                            otherParams={preservedParams}
                        />
                        {scopeId !== undefined ? (
                            <StatusTag tone="foreground" variant="pill">
                                <span>
                                    {facet}:{scopeId}
                                </span>
                                <Link
                                    href={buildWorkspacePath(workspaceId, "spend", {
                                        facet,
                                        from: from.toISOString(),
                                        to: to.toISOString(),
                                    })}
                                    aria-label="Clear scope filter"
                                    className="ml-1 text-muted-foreground hover:text-foreground"
                                >
                                    ×
                                </Link>
                            </StatusTag>
                        ) : null}
                        <GroupByFilter
                            className="ml-auto"
                            facet={facet}
                            basePath={spendBasePath}
                            otherParams={
                                status === "ok" ? preservedParams : { ...preservedParams, status }
                            }
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        <Kpi
                            label="Total spend"
                            value={formatUsd(totalUsd)}
                            tone={spendDirection(spendDelta)}
                            delta={
                                spendDelta !== null
                                    ? `${formatSignedPercent(spendDelta)} vs prior`
                                    : windowLabel
                            }
                        />
                        <Kpi
                            label="Total calls"
                            value={formatCount(series.totalCalls)}
                            tone="neut"
                            delta={
                                callsDelta !== null
                                    ? `${formatSignedPercent(callsDelta)} vs prior`
                                    : "vs prior window"
                            }
                        />
                        <Kpi
                            label="Cost / call"
                            value={perCall === null ? "—" : formatUsd(perCall)}
                            tone={spendDirection(perCallDelta)}
                            delta={
                                status !== "ok"
                                    ? "OK calls only"
                                    : perCall === null
                                      ? "No calls in range"
                                      : perCallDelta === null
                                        ? "No prior calls to compare"
                                        : `${formatSignedPercent(perCallDelta)} vs prior`
                            }
                        />
                        <Kpi
                            label="Peak day"
                            value={peak === null ? "—" : formatUsd(peak.total)}
                            tone="neut"
                            delta={
                                peak === null
                                    ? `No spend in ${windowLabelLower}`
                                    : formatDate(peak.date, tz)
                            }
                        />
                        <Link
                            href={blockedKpiHref}
                            aria-label="Filter spend to blocked calls"
                            className="rounded-md transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Kpi
                                label="Blocked calls"
                                value={formatCount(blockedCalls.lastDay)}
                                tone={blockedCalls.lastDay > 0 ? "down" : "neut"}
                                delta={`${formatCount(blockedCalls.lastHour)} in last hour`}
                            />
                        </Link>
                    </div>

                    <DashboardSection
                        label={status === "ok" ? "Spend over time" : "Calls over time"}
                        sublabel={`by ${facet} · ${windowLabelLower}`}
                    >
                        <SpendChart series={series} metric={status === "ok" ? "cost" : "count"} />
                    </DashboardSection>

                    <DashboardSection label="Recent activity" sublabel="selected window">
                        {anomalyAlerts.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No anomalies in this window.
                            </p>
                        ) : (
                            <div>
                                {anomalyAlerts.map((a) => {
                                    const scopeId = flattenScope(a).id ?? undefined;
                                    return (
                                        <FeedItem
                                            key={`${a.raisedAt.toISOString()}-${a.scope.tenantId ?? ""}-${a.scope.agentId ?? ""}-${a.reason}`}
                                            timestamp={formatInZone(a.raisedAt, tz, {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                                hourCycle: "h23",
                                            })}
                                            kind={a.severity === "critical" ? "block" : "warn"}
                                            {...(scopeId !== undefined ? { who: scopeId } : {})}
                                        >
                                            {a.reason}
                                        </FeedItem>
                                    );
                                })}
                            </div>
                        )}
                    </DashboardSection>

                    {facet !== "model" && untaggedShare >= UNTAGGED_BANNER_THRESHOLD ? (
                        <UntaggedBanner share={untaggedShare} facet={facet} />
                    ) : null}

                    <DashboardSection
                        label={`Top ${TOP_LIMIT} ${facet}s`}
                        sublabel={
                            facet === "model"
                                ? "highest spend by model"
                                : `tap a row to filter to that ${facet}`
                        }
                        bodyClassName="-mx-5"
                    >
                        <TopSpendersTable
                            rows={top}
                            totalUsd={series.totalUsd}
                            workspaceId={workspaceId}
                            facet={facet}
                            from={from}
                            to={to}
                            status={status}
                            modelProviders={modelProviders}
                        />
                    </DashboardSection>
                </>
            )}
        </section>
    );
}

const UNTAGGED_BANNER_THRESHOLD = 0.2;

function UntaggedBanner({ share, facet }: { readonly share: number; readonly facet: Facet }) {
    const pct = Math.round(share * 100);
    return (
        <div
            role="status"
            className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
        >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div className="flex-1">
                <p className="font-medium text-foreground">
                    {pct}% of spend has no {facet}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                    Pass <code className="font-mono">tenantId</code>,{" "}
                    <code className="font-mono">agentId</code>, or{" "}
                    <code className="font-mono">workflowId</code> when wrapping the client so spikes
                    trace back to a specific caller.
                </p>
            </div>
        </div>
    );
}

function formatSignedPercent(delta: number): string {
    const formatted = formatPercent(delta);
    return delta > 0 ? `+${formatted}` : formatted;
}

// Untagged share of total spend. Sums the UNTAGGED cost across the full series
// (every tag, every bucket) rather than the top-N table, so the banner stays
// correct even when untagged spend ranks below the visible rows.
function computeUntaggedShare(
    points: readonly { tag: string; costUsd: string }[],
    totalUsd: string,
): number {
    const total = Number.parseFloat(totalUsd);
    if (!Number.isFinite(total) || total <= 0) return 0;
    let untagged = 0;
    for (const p of points) {
        if (p.tag !== UNTAGGED) continue;
        const cost = Number.parseFloat(p.costUsd);
        if (Number.isFinite(cost)) untagged += cost;
    }
    return untagged / total;
}

function formatWindowSubtitle(from: Date, to: Date, tz: string): string {
    const opts: Intl.DateTimeFormatOptions = {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    };
    return `${formatInZone(from, tz, opts)} → ${formatInZone(to, tz, opts)} (${zoneAbbrev(from, tz)})`;
}

const RECENT_ALERTS_LIMIT = 5;

function spendDirection(delta: number | null): KpiTone {
    if (delta === null || delta === 0) return "neut";
    return delta > 0 ? "up" : "down";
}

// Prior comparison window for "vs prior" deltas. Delegates to the shared
// `deltaWindows` so the in-progress truncation policy (clamp current to `now`,
// match the prior period's elapsed span) lives in one place.
function priorWindow(from: Date, to: Date, now: Date): { from: Date; to: Date } {
    const { priorFrom, priorTo } = deltaWindows(dashboardWindowFromRange(from, to), now);
    return { from: priorFrom, to: priorTo };
}

function relativeDelta(current: number, prior: number): number | null {
    if (!Number.isFinite(current) || !Number.isFinite(prior)) return null;
    if (prior === 0) {
        if (current === 0) return 0;
        return current > 0 ? 1 : -1;
    }
    return (current - prior) / prior;
}

// Map `MeteringFilters` keys back to URL param spelling (`tenantId` → `tenant_id`).
const urlKeyForFilter = (key: string): string => key.replace(/Id$/, "_id");
