/**
 * Burn-rate tile for the Runway hero. Shows $/day for the active dashboard
 * window alongside a window-shaped spend spark.
 */

import { BurnRateTileView } from "@/components/ui/dashboard-views/burn-rate-tile-view";
import type { DashboardWindow } from "@/lib/dashboard-window";
import { getDailyRateInWindow, getSpendSeries } from "@/lib/dashboard/dashboard-stats";

interface BurnRateTileProps {
    readonly workspaceId: string;
    readonly dashboardWindow: DashboardWindow;
}

export async function BurnRateTile({ workspaceId, dashboardWindow }: BurnRateTileProps) {
    const [{ dailyRate }, series] = await Promise.all([
        getDailyRateInWindow({ workspaceId, window: dashboardWindow }),
        getSpendSeries({ workspaceId, from: dashboardWindow.from, to: dashboardWindow.to }),
    ]);

    return <BurnRateTileView dailyRate={dailyRate} series={series} />;
}
