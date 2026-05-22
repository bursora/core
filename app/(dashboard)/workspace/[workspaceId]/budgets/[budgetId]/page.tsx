import { BudgetDetailActions } from "@/app/(dashboard)/workspace/[workspaceId]/budgets/_components/budget-detail-actions";
import { BudgetHeader } from "@/app/(dashboard)/workspace/[workspaceId]/budgets/_components/budget-header";
import {
    deleteBudgetAction,
    updateBudgetAction,
} from "@/app/(dashboard)/workspace/[workspaceId]/budgets/actions";
import { PageHeader } from "@/components/shell/page-header";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { requireSessionUI } from "@/lib/auth";
import { buildBudgetDetailView } from "@/lib/budgeting";
import { getBudget, getBudgetStats } from "@/lib/budgeting/server";
import { formatPercent, formatUsd } from "@/lib/format";
import {
    countBlockedEventsForBudget,
    cumulativeSpendDaily,
    listBlockedEventsForBudget,
} from "@/lib/metering/server";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlocksTab } from "./_components/blocks-tab";
import { BudgetDetailTabs } from "./_components/budget-detail-tabs";
import { loadMoreBlocksAction } from "./actions";
import { resolveBudgetDetailTab } from "./tabs";

const BLOCKS_PAGE_LIMIT = 50;

interface BudgetDetailPageProps {
    params: Promise<{ workspaceId: string; budgetId: string }>;
    searchParams: Promise<{ tab?: string }>;
}

export default async function BudgetDetailPage({ params, searchParams }: BudgetDetailPageProps) {
    const { workspaceId, budgetId } = await params;
    const search = await searchParams;
    await requireSessionUI();

    const budget = await getBudget(workspaceId, budgetId);
    if (budget === null) notFound();

    const statsByBudget = await getBudgetStats(workspaceId, [budget]);
    const stats = statsByBudget[budget.id];
    if (stats === undefined) {
        throw new Error("invariant: getBudgetStats must return stats for the requested budget");
    }

    const from = new Date(stats.periodFromIso);
    const to = new Date(stats.periodToIso);

    const activeTab = resolveBudgetDetailTab(search.tab);

    const [sparkline, blockedCount, blockedPage] = await Promise.all([
        cumulativeSpendDaily({
            workspaceId,
            scopeType: budget.scopeType,
            scopeId: budget.scopeId,
            from,
            to,
        }),
        countBlockedEventsForBudget({ workspaceId, budgetId: budget.id, from, to }),
        listBlockedEventsForBudget({
            workspaceId,
            budgetId: budget.id,
            from,
            to,
            limit: BLOCKS_PAGE_LIMIT,
        }),
    ]);

    const view = buildBudgetDetailView({ workspaceId, budget, stats, sparkline });

    return (
        <div className="space-y-6">
            <PageHeader
                title={view.title}
                subtitle={view.subtitle}
                actions={
                    <BudgetDetailActions
                        workspaceId={workspaceId}
                        budget={budget}
                        updateAction={updateBudgetAction}
                        deleteAction={deleteBudgetAction}
                    />
                }
            />

            <BudgetHeader budget={budget} stats={stats} />

            <BudgetDetailTabs
                workspaceId={workspaceId}
                budgetId={budget.id}
                activeTab={activeTab}
                blockedCount={blockedCount}
                panels={{
                    overview: <OverviewPanel view={view} />,
                    blocks: (
                        <BlocksTab
                            workspaceId={workspaceId}
                            budgetId={budget.id}
                            initialItems={blockedPage.items}
                            initialNextCursor={blockedPage.nextCursor}
                            loadMore={loadMoreBlocksAction}
                        />
                    ),
                }}
            />
        </div>
    );
}

interface OverviewPanelProps {
    readonly view: ReturnType<typeof buildBudgetDetailView>;
}

function OverviewPanel({ view }: OverviewPanelProps) {
    return (
        <DashboardSection label="Overview" sublabel="current period">
            <div className="space-y-4">
                <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
                    <span className="text-lg">
                        <span className="font-semibold">{formatUsd(view.spendUsd)}</span>
                        <span className="text-muted-foreground"> / {formatUsd(view.capUsd)}</span>
                    </span>
                    <span
                        className={cn(
                            "text-sm font-medium",
                            view.ratio >= 1 ? "text-destructive" : "text-muted-foreground",
                        )}
                    >
                        {formatPercent(Math.min(view.ratio, 9.99))}
                        {view.ratio >= 1 ? " over" : ""}
                    </span>
                </div>

                <SpendSparkline
                    values={view.sparkline}
                    capUsd={view.capUsd}
                    ariaLabel={`Cumulative spend for ${view.title}`}
                />

                {view.projectionUsd !== null ? (
                    <p className="text-xs text-muted-foreground">
                        projected end-of-period{" "}
                        <span
                            className={cn(
                                "font-mono font-medium tabular-nums",
                                view.capUsd > 0 && view.projectionUsd > view.capUsd
                                    ? "text-destructive"
                                    : "text-foreground",
                            )}
                        >
                            {formatUsd(Math.round(view.projectionUsd))}
                        </span>
                    </p>
                ) : null}

                <Link
                    href={view.spendHref}
                    className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                    View in spend
                    <ArrowUpRight className="size-3.5" />
                </Link>
            </div>
        </DashboardSection>
    );
}

const SPARK_HEIGHT = 40;
const SPARK_VIEW_WIDTH = 100;
const SPARK_PADDING_Y = 2;

interface SpendSparklineProps {
    readonly values: readonly number[];
    readonly capUsd: number;
    readonly ariaLabel: string;
}

function SpendSparkline({ values, capUsd, ariaLabel }: SpendSparklineProps) {
    if (values.length === 0) {
        return (
            <div
                role="img"
                aria-label={`${ariaLabel}: no spend yet`}
                className="h-10 w-full rounded-sm bg-muted/40 dark:bg-muted/20"
            />
        );
    }

    const maxValue = Math.max(capUsd, ...values, 0);
    const yFor = (v: number): number => {
        if (maxValue <= 0) return SPARK_HEIGHT - SPARK_PADDING_Y;
        const usable = SPARK_HEIGHT - SPARK_PADDING_Y * 2;
        return SPARK_HEIGHT - SPARK_PADDING_Y - (v / maxValue) * usable;
    };

    const step = values.length > 1 ? SPARK_VIEW_WIDTH / (values.length - 1) : 0;
    const linePoints = values
        .map((v, i) => `${(i * step).toFixed(2)},${yFor(v).toFixed(2)}`)
        .join(" ");
    const capY = yFor(capUsd).toFixed(2);

    return (
        <svg
            role="img"
            aria-label={ariaLabel}
            viewBox={`0 0 ${SPARK_VIEW_WIDTH} ${SPARK_HEIGHT}`}
            preserveAspectRatio="none"
            className="h-10 w-full"
        >
            {capUsd > 0 ? (
                <line
                    x1={0}
                    x2={SPARK_VIEW_WIDTH}
                    y1={capY}
                    y2={capY}
                    strokeDasharray="2 2"
                    strokeWidth={0.75}
                    className="stroke-muted-foreground/50 dark:stroke-muted-foreground/40"
                    vectorEffect="non-scaling-stroke"
                />
            ) : null}
            <polyline
                points={linePoints}
                fill="none"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="stroke-foreground dark:stroke-foreground"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}
