import { StatusTag } from "@/components/ui/workspace/status-tag";
import type { BudgetStats, RawBudget } from "@/lib/budgeting";
import { MODE_META, PERIOD_META, SCOPE_META } from "./labels";

interface BudgetHeaderProps {
    readonly budget: RawBudget;
    readonly stats: BudgetStats | undefined;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function BudgetHeader({ budget, stats }: BudgetHeaderProps) {
    const scope = SCOPE_META[budget.scopeType];
    const mode = MODE_META[budget.mode];
    const ModeIcon = mode.Icon;
    const blocking = stats?.currentlyBlocking ?? false;
    const firstTrippedAt = stats?.firstTrippedAt ?? null;
    const resetIn = stats ? formatResetIn(stats.periodToIso) : null;

    return (
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            {budget.scopeId ? (
                <code className="truncate font-mono text-[11px] uppercase tracking-[0.08em] text-foreground">
                    {budget.scopeId}
                </code>
            ) : (
                <code className="font-mono text-[11px] uppercase tracking-[0.08em] text-foreground">
                    {scope.label.toLowerCase()}
                </code>
            )}
            <StatusTag tone="muted">{PERIOD_META[budget.period].label.toLowerCase()}</StatusTag>
            <StatusTag tone={mode.tone} className="flex items-center gap-1">
                <ModeIcon className="size-3" />
                {mode.label.toLowerCase()}
            </StatusTag>
            {blocking ? (
                <span title={formatTrippedTitle(firstTrippedAt)}>
                    <StatusTag tone="destructive" variant="pill">
                        blocking
                    </StatusTag>
                </span>
            ) : null}
            {resetIn ? <span className="text-xs text-muted-foreground">{resetIn}</span> : null}
        </div>
    );
}

// `firstTrippedAt === null` is reachable when spend has crossed the cap but no
// SDK preflight has hit the decide path yet, so no crossing alert has been
// recorded. Surface that case so the title doesn't claim a past denial that
// never happened.
function formatTrippedTitle(firstTrippedAt: Date | null): string {
    if (firstTrippedAt === null) return "Next call would block";
    return `Blocking since ${firstTrippedAt.toISOString()}`;
}

function formatResetIn(periodToIso: string): string | null {
    const ms = new Date(periodToIso).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return null;
    if (ms < HOUR_MS) {
        const mins = Math.max(1, Math.round(ms / (60 * 1000)));
        return `resets in ${mins}m`;
    }
    if (ms < DAY_MS) {
        const hrs = Math.max(1, Math.round(ms / HOUR_MS));
        return `resets in ${hrs}h`;
    }
    const days = Math.max(1, Math.round(ms / DAY_MS));
    return `resets in ${days}d`;
}
