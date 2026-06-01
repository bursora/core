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
}

export async function PaceTile({ workspaceId, dashboardWindow }: PaceTileProps) {
    const delta = await getSpendPaceInWindow({ workspaceId, window: dashboardWindow });

    return (
        <PaceTileView
            direction={paceDirection(delta)}
            delta={delta}
            windowLabel={dashboardWindow.label}
        />
    );
}
