// Pure presentational sibling of the dashboard `BurnRateTile`. Renders the
// $/day figure for the active window alongside a window-shaped spend spark.

import { formatUsd } from "@/lib/format";
import { SparkChart } from "../spark-chart";

export interface BurnRateTileViewProps {
    readonly dailyRate: number;
    readonly series: readonly number[];
}

export function BurnRateTileView({ dailyRate, series }: BurnRateTileViewProps) {
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
