import { CloudPaywallPage } from "@/app/(dashboard)/workspace/[workspaceId]/_components/cloud-paywall-page";
import { PageHeader } from "@/components/shell/page-header";
import { SpendCompositionPanel } from "@/components/ui/dashboard-views/spend-composition-panel";
import { WhatsBreakingPanel } from "@/components/ui/dashboard-views/whats-breaking";
import { Skeleton } from "@/components/ui/skeleton";
import { WindowFilter } from "@/components/ui/workspace/filters/window-filter";
import { RefreshControls } from "@/components/ui/workspace/refresh-controls";
import { requireSessionUI } from "@/lib/auth";
import { cloudWorkspaceLocked } from "@/lib/billing-gate/server";
import { getSpendComposition } from "@/lib/compose/spend-composition";
import { getCustomerTrajectories, getModelTrajectories } from "@/lib/compose/trajectories";
import { getWhatsBreaking } from "@/lib/compose/whats-breaking";
import { parseWindowKey, resolveWindow, type DashboardWindow } from "@/lib/dashboard-window";
import { buildWorkspacePath } from "@/lib/routes";
import { FACETS, type Facet } from "@/lib/spend-types";
import { Suspense } from "react";
import { BurnRateTile } from "./_components/burn-rate-tile";
import { CapacityRow } from "./_components/capacity-row";
import { NowStrip } from "./_components/now-strip";
import { PaceTile } from "./_components/pace-tile";
import { RecentAlertsPanel } from "./_components/recent-alerts-panel";
import { RunwayProjection } from "./_components/runway-projection";
import { StatusStrip } from "./_components/status-strip";
import { TopSpendersSnapshot } from "./_components/top-spenders-snapshot";
import { TrajectoriesToWatchPanel } from "./_components/trajectories-to-watch";

interface DashboardPageProps {
    params: Promise<{ workspaceId: string }>;
    searchParams: Promise<{ window?: string | string[]; facet?: string }>;
}

export default async function DashboardPage({ params, searchParams }: DashboardPageProps) {
    const session = await requireSessionUI();
    const { workspaceId } = await params;

    // Secure gate: bail before reading searchParams or instantiating any of the
    // data-fetching child components, so a locked cloud workspace never has its
    // real spend or event numbers fetched, computed, or sent to the client.
    if (await cloudWorkspaceLocked(workspaceId)) {
        return (
            <CloudPaywallPage
                workspaceId={workspaceId}
                title="Dashboard"
                subtitle={`Welcome, ${session.user.email}.`}
            />
        );
    }

    const { window: rawWindow, facet: rawFacet } = await searchParams;
    const windowKey = parseWindowKey(rawWindow);
    const dashboardWindow = resolveWindow(windowKey, new Date());
    const facet: Facet =
        rawFacet !== undefined && (FACETS as readonly string[]).includes(rawFacet)
            ? (rawFacet as Facet)
            : "tenant";

    return (
        <section className="flex flex-col gap-6">
            <PageHeader
                title="Dashboard"
                subtitle={`Welcome, ${session.user.email}.`}
                actions={
                    <div className="flex items-center gap-2">
                        <WindowFilter value={windowKey} />
                        <RefreshControls />
                    </div>
                }
            />

            <Suspense fallback={null}>
                <StatusStrip workspaceId={workspaceId} userId={session.user.id} />
            </Suspense>

            <Suspense fallback={<NowStripSkeleton dashboardWindow={dashboardWindow} />}>
                <NowStrip workspaceId={workspaceId} dashboardWindow={dashboardWindow} />
            </Suspense>

            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
                <Suspense fallback={<PanelSkeleton rows={6} />}>
                    <TopSpendersSnapshot
                        workspaceId={workspaceId}
                        dashboardWindow={dashboardWindow}
                        facet={facet}
                        windowKey={windowKey}
                    />
                </Suspense>
                <Suspense fallback={<PanelSkeleton rows={5} />}>
                    <SpendCompositionSection
                        workspaceId={workspaceId}
                        dashboardWindow={dashboardWindow}
                    />
                </Suspense>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                <Suspense fallback={<PanelSkeleton rows={2} rowHeight={10} />}>
                    <WhatsBreakingSection workspaceId={workspaceId} />
                </Suspense>
                <Suspense fallback={<PanelSkeleton rows={5} />}>
                    <RecentAlertsPanel workspaceId={workspaceId} />
                </Suspense>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:items-start">
                <Suspense fallback={<HeroSkeleton />}>
                    <RunwayProjection workspaceId={workspaceId} />
                </Suspense>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    <Suspense fallback={<TileSkeleton label="Burn rate" />}>
                        <BurnRateTile workspaceId={workspaceId} dashboardWindow={dashboardWindow} />
                    </Suspense>
                    <Suspense fallback={<TileSkeleton label="Pace" />}>
                        <PaceTile workspaceId={workspaceId} dashboardWindow={dashboardWindow} />
                    </Suspense>
                </div>
            </div>

            <Suspense fallback={null}>
                <TrajectoriesToWatchSection
                    workspaceId={workspaceId}
                    dashboardWindow={dashboardWindow}
                />
            </Suspense>

            <Suspense fallback={<CapacityRowSkeleton />}>
                <CapacityRow workspaceId={workspaceId} />
            </Suspense>
        </section>
    );
}

async function WhatsBreakingSection({ workspaceId }: { readonly workspaceId: string }) {
    const breaking = await getWhatsBreaking(workspaceId);
    return <WhatsBreakingPanel workspaceId={workspaceId} rows={breaking.rows} />;
}

async function SpendCompositionSection({
    workspaceId,
    dashboardWindow,
}: {
    readonly workspaceId: string;
    readonly dashboardWindow: DashboardWindow;
}) {
    const rows = await getSpendComposition({
        workspaceId,
        from: dashboardWindow.from,
        to: dashboardWindow.to,
    });
    return (
        <SpendCompositionPanel
            rows={rows}
            windowLabel={dashboardWindow.label}
            viewAllHref={buildWorkspacePath(workspaceId, "spend")}
        />
    );
}

async function TrajectoriesToWatchSection({
    workspaceId,
    dashboardWindow,
}: {
    readonly workspaceId: string;
    readonly dashboardWindow: DashboardWindow;
}) {
    const [customer, model] = await Promise.all([
        getCustomerTrajectories({ workspaceId, window: dashboardWindow }),
        getModelTrajectories({ workspaceId, window: dashboardWindow }),
    ]);
    return <TrajectoriesToWatchPanel workspaceId={workspaceId} customer={customer} model={model} />;
}

function PanelSkeleton({
    rows,
    rowHeight = 8,
}: {
    readonly rows: number;
    readonly rowHeight?: 8 | 10;
}) {
    return (
        <div className="rounded-[8px] border border-border bg-background p-5">
            <Skeleton className="h-3 w-40" />
            <div className="mt-4 flex flex-col gap-2">
                {Array.from({ length: rows }, (_, i) => (
                    <Skeleton key={i} className={rowHeight === 10 ? "h-10 w-full" : "h-8 w-full"} />
                ))}
            </div>
        </div>
    );
}

function HeroSkeleton() {
    return (
        <section className="rounded-[8px] border border-border bg-background p-5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="mt-3 h-12 w-56" />
            <Skeleton className="mt-3 h-3 w-72" />
            <Skeleton className="mt-3 h-3 w-48" />
        </section>
    );
}

function TileSkeleton({ label }: { readonly label: string }) {
    return (
        <div className="rounded-[8px] border border-border bg-background p-3.5">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                {label}
            </div>
            <Skeleton className="mt-2 h-7 w-32" />
        </div>
    );
}

function NowStripSkeleton({
    dashboardWindow,
}: {
    readonly dashboardWindow: { readonly label: string };
}) {
    const suffix = dashboardWindow.label.toLowerCase();
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TileSkeleton label={`Spend, ${suffix}`} />
            <TileSkeleton label={`Calls, ${suffix}`} />
            <TileSkeleton label="Active budgets" />
            <TileSkeleton label="Alerts, 24h" />
        </div>
    );
}

function CapacityRowSkeleton() {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TileSkeleton label="API keys" />
            <TileSkeleton label="Members" />
            <TileSkeleton label="Channels" />
        </div>
    );
}
