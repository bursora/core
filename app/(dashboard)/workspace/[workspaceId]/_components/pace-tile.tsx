/**
 * Pace tile for the Runway hero. Compares spend in the active window against
 * the prior period truncated to the same elapsed length and surfaces a
 * directional label (accelerating, steady, or cooling) with the signed delta.
 */

import {
    getSpendPaceInWindow,
    paceDirection,
    type PaceDirection,
} from "@/lib/dashboard/dashboard-stats";
import type { DashboardWindow } from "@/lib/dashboard-window";
import { formatSignedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PaceTileProps {
    readonly workspaceId: string;
    readonly dashboardWindow: DashboardWindow;
}

const DIRECTION_GLYPH: Record<PaceDirection, string> = {
    accelerating: "▲",
    steady: "→",
    cooling: "▼",
};

const DIRECTION_TONE: Record<PaceDirection, string> = {
    accelerating: "text-destructive",
    steady: "text-muted-foreground/70",
    cooling: "text-success",
};

export async function PaceTile({ workspaceId, dashboardWindow }: PaceTileProps) {
    const delta = await getSpendPaceInWindow({ workspaceId, window: dashboardWindow });
    const direction = paceDirection(delta);

    return (
        <div className="rounded-[8px] border border-border bg-background p-3.5">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                Pace
            </div>
            <div className="mt-1.5 flex items-end justify-between gap-3">
                <div className="text-[24px] font-semibold tracking-[-0.02em] tabular-nums text-foreground">
                    <span className="capitalize">{direction}</span>
                    <span className={cn("ml-2 text-[18px]", DIRECTION_TONE[direction])}>
                        {DIRECTION_GLYPH[direction]}
                    </span>
                </div>
                <div className="font-mono text-[11px] tabular-nums text-muted-foreground/80">
                    {formatSignedPercent(delta)} vs prior {dashboardWindow.label.toLowerCase()}
                </div>
            </div>
        </div>
    );
}
