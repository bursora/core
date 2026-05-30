import { TopSpendersSnapshotView } from "@/components/ui/dashboard-views/top-spenders-snapshot-view";
import type { DashboardWindow, WindowKey } from "@/lib/dashboard-window";
import { DEFAULT_WINDOW_KEY } from "@/lib/dashboard-window";
import { getSpendInWindow } from "@/lib/dashboard/dashboard-stats";
import { getTopSpenders } from "@/lib/metering/server";
import { resolveModelProviders } from "@/lib/models-server";
import { buildWorkspacePath } from "@/lib/routes";
import type { Facet } from "@/lib/spend-types";

interface Props {
    readonly workspaceId: string;
    readonly dashboardWindow: DashboardWindow;
    readonly facet: Facet;
    readonly windowKey: WindowKey;
}

export async function TopSpendersSnapshot({
    workspaceId,
    dashboardWindow,
    facet,
    windowKey,
}: Props) {
    const { from, to, label } = dashboardWindow;
    const suffix = label.toLowerCase();
    const [rows, totalSpend] = await Promise.all([
        getTopSpenders({ workspaceId, facet, from, to, limit: 5 }),
        getSpendInWindow({ workspaceId, from, to }),
    ]);
    const modelProviders =
        facet === "model" ? await resolveModelProviders(rows.map((r) => r.tag)) : {};

    return (
        <TopSpendersSnapshotView
            facet={facet}
            suffix={suffix}
            rows={rows}
            totalUsd={totalSpend.toFixed(8)}
            modelProviders={modelProviders}
            viewAllHref={buildWorkspacePath(workspaceId, "spend", { facet })}
            groupBy={{
                mode: "link",
                basePath: buildWorkspacePath(workspaceId),
                otherParams: windowKey !== DEFAULT_WINDOW_KEY ? { window: windowKey } : {},
            }}
            workspaceId={workspaceId}
            from={from}
            to={to}
        />
    );
}
