// Pure presentational sibling of the dashboard `PaceTile`. Surfaces the
// directional label (accelerating, steady, cooling) and the signed delta vs
// the prior period. The caller resolves the direction; this view owns the
// glyph + tone styling.

import { formatSignedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PaceDirection = "accelerating" | "steady" | "cooling";

export interface PaceTileViewProps {
    readonly direction: PaceDirection;
    readonly delta: number;
    readonly windowLabel: string;
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

export function PaceTileView({ direction, delta, windowLabel }: PaceTileViewProps) {
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
                    {formatSignedPercent(delta)} vs prior {windowLabel.toLowerCase()}
                </div>
            </div>
        </div>
    );
}
