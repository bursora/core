import { Button } from "../button";
import { SegmentedBar } from "../segmented-bar";
import { DashboardSection } from "../workspace/dashboard-section";
import { formatUsd, formatWholePercent } from "@/lib/format";
import type { CustomerComposition } from "@/lib/spend-composition";
import { cn } from "@/lib/utils";
import type { Route } from "next";
import Link from "next/link";

export interface SpendCompositionPanelProps {
    readonly rows: readonly CustomerComposition[];
    readonly windowLabel: string;
    /** Target for the "View all spend →" affordance. Pass `null` to drop the
     *  link (e.g. landing-page composition where the route is auth-gated). */
    readonly viewAllHref: Route | null;
}

// /70 opacity matches the `bg-primary/70` fill the other dashboard share
// bars use, keeping every slice on the app's tone scale.
const SEGMENT_COLORS = [
    "bg-primary/70",
    "bg-success/70",
    "bg-warning/70",
    "bg-destructive/70",
    "bg-muted-foreground/70",
] as const;

const OVERFLOW_COLOR = "bg-muted-foreground/30";

interface Slice {
    readonly key: string;
    readonly model: string;
    readonly share: number;
    readonly colorClass: string;
}

export function SpendCompositionPanel({
    rows,
    windowLabel,
    viewAllHref,
}: SpendCompositionPanelProps) {
    const actions =
        viewAllHref === null ? undefined : (
            <Button asChild variant="link" size="sm" className="h-auto p-0">
                <Link href={viewAllHref}>View all spend →</Link>
            </Button>
        );

    return (
        <DashboardSection
            label="Where it goes"
            sublabel={`top customers · this ${windowLabel.toLowerCase()}`}
            actions={actions}
        >
            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No tagged customer spend in this window.
                </p>
            ) : (
                <div className="flex flex-col gap-4">
                    {rows.map((row) => (
                        <CustomerRow key={row.tenantId} row={row} />
                    ))}
                </div>
            )}
        </DashboardSection>
    );
}

function CustomerRow({ row }: { readonly row: CustomerComposition }) {
    const slices: Slice[] = row.models.map((m, i) => ({
        key: m.model,
        model: m.model,
        share: m.share,
        colorClass: SEGMENT_COLORS[i] ?? OVERFLOW_COLOR,
    }));
    const ariaLabel = `${row.tenantId} spend by model: ${slices
        .map((s) => `${s.model} ${formatWholePercent(s.share)}`)
        .join(", ")}`;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
                        customer
                    </span>
                    <code className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-foreground">
                        {row.tenantId}
                    </code>
                </div>
                <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-foreground">
                    {formatUsd(row.totalCostUsd)}
                </span>
            </div>

            <SegmentedBar ariaLabel={ariaLabel} slices={slices} />

            <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {slices.map((s) => (
                    <li
                        key={s.key}
                        className="flex items-baseline gap-1.5 font-mono text-[11px] tabular-nums text-muted-foreground"
                    >
                        <span
                            className={cn(
                                "h-2 w-2 shrink-0 self-center rounded-[2px]",
                                s.colorClass,
                            )}
                        />
                        <code className="text-foreground">{s.model}</code>
                        <span>{formatWholePercent(s.share)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
