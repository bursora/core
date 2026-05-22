/**
 * Runway projection hero. Shows the linearly-extrapolated end-of-month
 * spend in giant tabular numerals, with a vs-last-month delta, a percent-of-cap
 * breakdown, and a forecast-confidence line.
 *
 * The cap denominator comes from `getMonthlySpendCap`: a workspace-scope
 * monthly budget when present, otherwise `null` (the percentage line renders
 * as "no monthly cap").
 */

import {
    computeDelta,
    confidenceLabel,
    getMonthlySpendCap,
    getProjectedEom,
} from "@/app/(dashboard)/workspace/[workspaceId]/_lib/dashboard-stats";
import { formatDashboardPercent, formatDashboardUsd, formatSignedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface RunwayProjectionProps {
    readonly workspaceId: string;
}

const CAP_BREACH_RATIO = 1;
const CAP_WARN_RATIO = 0.8;

export async function RunwayProjection({ workspaceId }: RunwayProjectionProps) {
    const now = new Date();
    const [projection, cap] = await Promise.all([
        getProjectedEom({ workspaceId, now }),
        getMonthlySpendCap(workspaceId),
    ]);

    const hasPriorMonth = projection.priorMonth > 0;
    const vsLastMonth = hasPriorMonth
        ? computeDelta(projection.projected, projection.priorMonth)
        : null;
    const capRatio = cap !== null && cap > 0 ? projection.projected / cap : null;
    const capTone = toneForRatio(capRatio);

    return (
        <section className="rounded-[8px] border border-border bg-background p-5">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                Projected end of month
            </div>
            <div className="mt-2 text-[40px] font-semibold tracking-[-0.02em] tabular-nums text-foreground sm:text-[48px]">
                {formatDashboardUsd(projection.projected)}
            </div>
            <div className="mt-2 font-mono text-[11px] text-muted-foreground/80">
                {vsLastMonth !== null ? (
                    <>
                        <span className="tabular-nums">{formatSignedPercent(vsLastMonth)}</span>{" "}
                        <span>vs last month</span>
                        <span className="mx-2 text-muted-foreground/40">·</span>
                    </>
                ) : (
                    <>
                        <span>first month</span>
                        <span className="mx-2 text-muted-foreground/40">·</span>
                    </>
                )}
                {capRatio === null ? (
                    <span>no monthly cap</span>
                ) : (
                    <span className={cn("tabular-nums", capTone)}>
                        {formatDashboardPercent(capRatio)} of {formatDashboardUsd(cap ?? 0)} cap
                    </span>
                )}
            </div>
            <div className="mt-3 font-mono text-[11px] text-muted-foreground/60">
                forecast confidence: {confidenceLabel(projection.daysElapsed)}
            </div>
        </section>
    );
}

function toneForRatio(ratio: number | null): string {
    if (ratio === null) return "";
    if (ratio >= CAP_BREACH_RATIO) return "text-destructive";
    if (ratio >= CAP_WARN_RATIO) return "text-warning";
    return "";
}
