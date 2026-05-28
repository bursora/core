// Trajectories to watch: scannable rows for forward-looking concerns.
// Hidden entirely when nothing crosses threshold. Customer trajectories fill
// first (sorted by ETA ascending), then model trajectories.

import type { CustomerTrajectory, ModelTrajectory } from "@/lib/compose/trajectories";
import { Button } from "@/components/ui/button";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { formatDate, formatWholePercent } from "@/lib/format";
import { buildWorkspacePath } from "@/lib/routes";
import Link from "next/link";

interface TrajectoriesToWatchPanelProps {
    readonly workspaceId: string;
    readonly customer: readonly CustomerTrajectory[];
    readonly model: readonly ModelTrajectory[];
}

const MAX_ITEMS = 5;

const RATIO_FMT = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
});

export function TrajectoriesToWatchPanel({
    workspaceId,
    customer,
    model,
}: TrajectoriesToWatchPanelProps) {
    if (customer.length === 0 && model.length === 0) return null;

    const customerSlots = customer.slice(0, MAX_ITEMS);
    const remaining = MAX_ITEMS - customerSlots.length;
    const modelSlots = remaining > 0 ? model.slice(0, remaining) : [];
    const total = customerSlots.length + modelSlots.length;

    return (
        <DashboardSection
            label="Trajectories to watch"
            sublabel={`${total} item${total === 1 ? "" : "s"}`}
        >
            <ul className="flex flex-col divide-y divide-border/60">
                {customerSlots.map((c) => (
                    <CustomerRow key={`tenant-${c.tenantId}`} workspaceId={workspaceId} row={c} />
                ))}
                {modelSlots.map((m) => (
                    <ModelRow key={`model-${m.model}`} workspaceId={workspaceId} row={m} />
                ))}
            </ul>
        </DashboardSection>
    );
}

function CustomerRow({
    workspaceId,
    row,
}: {
    readonly workspaceId: string;
    readonly row: CustomerTrajectory;
}) {
    const ratio = RATIO_FMT.format(row.ratio);
    const eta = formatDate(row.etaDate).toLowerCase();
    return (
        <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
                        customer
                    </span>
                    <code className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-foreground">
                        {row.tenantId}
                    </code>
                </div>
                <div className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                    <span className="text-warning">{ratio}x</span> · {row.budgetPeriod} cap by {eta}
                </div>
            </div>
            <Button asChild variant="link" size="sm" className="h-auto shrink-0 p-0">
                <Link href={buildWorkspacePath(workspaceId, "budgets")}>Raise cap</Link>
            </Button>
        </li>
    );
}

function ModelRow({
    workspaceId,
    row,
}: {
    readonly workspaceId: string;
    readonly row: ModelTrajectory;
}) {
    const cpc = RATIO_FMT.format(row.cpcRatio);
    const sharePrior = formatWholePercent(row.sharePrior);
    const shareNow = formatWholePercent(row.shareNow);
    return (
        <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
                        model
                    </span>
                    <code className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-foreground">
                        {row.model}
                    </code>
                </div>
                <div className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                    share <span className="text-foreground">{sharePrior}</span> →{" "}
                    <span className="text-warning">{shareNow}</span> · cpc{" "}
                    <span className="text-warning">{cpc}x</span>
                </div>
            </div>
            <Button asChild variant="link" size="sm" className="h-auto shrink-0 p-0">
                <Link href={buildWorkspacePath(workspaceId, "spend", { facet: "model" })}>
                    Open spend
                </Link>
            </Button>
        </li>
    );
}
