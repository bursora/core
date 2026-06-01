// Pure presentational sibling of the dashboard `RunwayProjection` hero. Takes
// the already-computed projection numbers and a confidence label, formats them
// for display, and owns the cap-tone styling. The real component supplies live
// figures; the landing page supplies a fixture.

import { formatDashboardPercent, formatDashboardUsd, formatSignedPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface RunwayProjectionViewProps {
    readonly projected: number;
    /** Delta vs the prior month, or null for a workspace's first month. */
    readonly vsLastMonth: number | null;
    /** Monthly spend cap in dollars, or null when no workspace cap exists. */
    readonly cap: number | null;
    /** projected / cap, or null when there is no cap to measure against. */
    readonly capRatio: number | null;
    readonly confidence: string;
}

const CAP_BREACH_RATIO = 1;
const CAP_WARN_RATIO = 0.8;

export function RunwayProjectionView({
    projected,
    vsLastMonth,
    cap,
    capRatio,
    confidence,
}: RunwayProjectionViewProps) {
    const capTone = toneForRatio(capRatio);

    return (
        <section className="rounded-[8px] border border-border bg-background p-5">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                Projected end of month
            </div>
            <div className="mt-2 text-[40px] font-semibold tracking-[-0.02em] tabular-nums text-foreground sm:text-[48px]">
                {formatDashboardUsd(projected)}
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
                forecast confidence: {confidence}
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
