// What breaks first: ETA-sorted countdown stack. Each row renders the scope,
// inline mode tag, ETA pill, usage bar, spend/limit/pct, and action links.
// Empty state inlines a "create your first budget" CTA.

import {
    BUDGET_USAGE_DANGER_THRESHOLD,
    ETA_SOON_DAYS,
    ETA_URGENT_DAYS,
    budgetUsageBarTone,
    formatEtaHint,
    type ScopeType,
    type WhatsBreakingRow,
} from "@/lib/budgeting";
import { formatDate, formatUsd } from "@/lib/format";
import { buildWorkspacePath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Button } from "../button";
import { ShareBar } from "../share-bar";
import { DashboardSection } from "../workspace/dashboard-section";

export interface WhatsBreakingPanelProps {
    readonly workspaceId: string;
    readonly rows: readonly WhatsBreakingRow[];
    /** When false, omits all action links (Manage, Create your first budget).
     *  Defaults to true. The landing-page composition passes false so visitors
     *  aren't sent to auth-gated routes. */
    readonly actionsEnabled?: boolean;
}

const MODE_TONE: Record<WhatsBreakingRow["mode"], string> = {
    block: "text-destructive",
    throttle: "text-warning",
    notify: "text-muted-foreground",
};

const ETA_PILL_BASE =
    "shrink-0 rounded-[4px] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] tabular-nums";

const ETA_PILL_TONE = {
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-warning/10 text-warning",
    safe: "bg-muted text-muted-foreground",
} as const;

export function WhatsBreakingPanel({
    workspaceId,
    rows,
    actionsEnabled = true,
}: WhatsBreakingPanelProps) {
    return (
        <DashboardSection
            label="What breaks first"
            {...(rows.length > 0 ? { sublabel: `${rows.length} tracked` } : {})}
        >
            {rows.length === 0 ? (
                <EmptyState workspaceId={workspaceId} actionsEnabled={actionsEnabled} />
            ) : (
                <ul className="flex flex-col divide-y divide-border/60">
                    {rows.map((row) => (
                        <BreakingRow
                            key={row.source.budgetId}
                            workspaceId={workspaceId}
                            row={row}
                            actionsEnabled={actionsEnabled}
                        />
                    ))}
                </ul>
            )}
        </DashboardSection>
    );
}

function EmptyState({
    workspaceId,
    actionsEnabled,
}: {
    readonly workspaceId: string;
    readonly actionsEnabled: boolean;
}) {
    return (
        <div className="flex flex-col items-start gap-1 py-1">
            <p className="text-sm text-foreground">No budgets configured</p>
            <p className="text-xs text-muted-foreground">
                Set a spend cap to enforce limits before calls go out.
            </p>
            {actionsEnabled ? (
                <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0">
                    <Link href={buildWorkspacePath(workspaceId, "budgets")}>
                        Create your first budget
                    </Link>
                </Button>
            ) : null}
        </div>
    );
}

interface BreakingRowProps {
    readonly workspaceId: string;
    readonly row: WhatsBreakingRow;
    readonly actionsEnabled: boolean;
}

function BreakingRow({ workspaceId, row, actionsEnabled }: BreakingRowProps) {
    const scope = formatScopeLabel(row.scopeType, row.scopeId, row.period);
    const pct = Math.round(Math.min(row.usage, BUDGET_USAGE_DANGER_THRESHOLD) * 100);
    const overage = row.usage > BUDGET_USAGE_DANGER_THRESHOLD;
    const tone = budgetUsageBarTone(row.usage);

    return (
        <li className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <code className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-foreground">
                        {scope}
                    </code>
                    <span
                        className={cn(
                            "font-mono text-[10px] uppercase tracking-[0.08em]",
                            MODE_TONE[row.mode],
                        )}
                    >
                        ({row.mode})
                    </span>
                </div>
                <EtaPill row={row} />
            </div>
            <ShareBar percent={pct} fillClassName={tone} ariaLabel={`${scope}: ${pct}% used`} />
            <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatUsd(row.spent)} / {formatUsd(row.limit)} ·{" "}
                    {overage ? `${Math.round(row.usage * 100)}%` : `${pct}%`}
                </span>
                {actionsEnabled ? (
                    <Button asChild variant="link" size="sm" className="h-auto p-0">
                        <Link href={buildWorkspacePath(workspaceId, "budgets")}>Manage</Link>
                    </Button>
                ) : null}
            </div>
        </li>
    );
}

function EtaPill({ row }: { readonly row: WhatsBreakingRow }) {
    const text = pillText(row);
    const tone = pillTone(row);
    return <span className={cn(ETA_PILL_BASE, ETA_PILL_TONE[tone])}>{text}</span>;
}

function pillText(row: WhatsBreakingRow): string {
    if (row.etaKind === "today") return "today";
    if (row.etaKind === "safe") return `safe · ${formatDate(row.periodEnd).toLowerCase()}`;
    const days = row.etaDays ?? 0;
    return `${formatEtaHint(days)} · ${dateHint(days)}`;
}

function pillTone(row: WhatsBreakingRow): keyof typeof ETA_PILL_TONE {
    if (row.etaKind === "safe") return "safe";
    if (row.etaKind === "today") return "destructive";
    const days = row.etaDays ?? 0;
    if (days < ETA_URGENT_DAYS) return "destructive";
    if (days <= ETA_SOON_DAYS) return "warning";
    return "safe";
}

function dateHint(days: number): string {
    const hitMs = Date.now() + days * 86_400_000;
    return formatDate(new Date(hitMs)).toLowerCase();
}

function formatScopeLabel(type: ScopeType, id: string | null, period: string): string {
    if (type === "workspace" || id === null) return `workspace · ${period} budget`;
    return `${id} (${type}) · ${period} budget`;
}
