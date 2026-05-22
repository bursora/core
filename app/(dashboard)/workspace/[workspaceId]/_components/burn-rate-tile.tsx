/**
 * Burn-rate tile for the Runway hero. Shows $/day for the active dashboard
 * window alongside a window-shaped spend spark.
 */

import {
    getDailyRateInWindow,
    getSpendSeries,
} from "@/app/(dashboard)/workspace/[workspaceId]/_lib/dashboard-stats";
import { SparkChart } from "@/components/ui/spark-chart";
import type { DashboardWindow } from "@/lib/dashboard-window";
import { formatUsd } from "@/lib/format";

interface BurnRateTileProps {
    readonly workspaceId: string;
    readonly dashboardWindow: DashboardWindow;
}

export async function BurnRateTile({ workspaceId, dashboardWindow }: BurnRateTileProps) {
    const [{ dailyRate }, series] = await Promise.all([
        getDailyRateInWindow({ workspaceId, window: dashboardWindow }),
        getSpendSeries({ workspaceId, from: dashboardWindow.from, to: dashboardWindow.to }),
    ]);

    return (
        <div className="rounded-[8px] border border-border bg-background p-3.5">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                Burn rate
            </div>
            <div className="mt-1.5 flex items-end justify-between gap-3">
                <div className="text-[24px] font-semibold tracking-[-0.02em] tabular-nums text-foreground">
                    {formatUsd(dailyRate)}
                    <span className="ml-1 font-mono text-[11px] text-muted-foreground/70">
                        /day
                    </span>
                </div>
                <div className="h-10 w-24 shrink-0">
                    <SparkChart data={series} />
                </div>
            </div>
        </div>
    );
}
