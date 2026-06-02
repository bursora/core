/**
 * Pace tile for the Runway hero. Compares spend in the active window against
 * the prior period truncated to the same elapsed length and surfaces a
 * directional label (accelerating, steady, or cooling) with the signed delta.
 */

import { PaceTileView } from "@/components/ui/dashboard-views/pace-tile-view";
import type { DashboardWindow } from "@/lib/dashboard-window";
import { getSpendPaceInWindow, paceDirection } from "@/lib/dashboard/dashboard-stats";

interface PaceTileProps {
    readonly workspaceId: string;
    readonly dashboardWindow: DashboardWindow;
    readonly now: Date;
}

export async function PaceTile({ workspaceId, dashboardWindow, now }: PaceTileProps) {
    const delta = await getSpendPaceInWindow({ workspaceId, window: dashboardWindow, now });

    return (
        <PaceTileView
            direction={paceDirection(delta)}
            delta={delta}
            windowLabel={dashboardWindow.label}
        />
    );
}
