import type { BudgetStats } from "./server";

// Linear "burn rate" extrapolation to period end. Returns null when no time
// has elapsed or the period has zero length — rate is undefined.

export function projectEndOfPeriod(
    stats: BudgetStats,
    spendUsd: number,
    now: Date = new Date(),
): number | null {
    const from = new Date(stats.periodFromIso).getTime();
    const to = new Date(stats.periodToIso).getTime();
    const total = to - from;
    const elapsed = Math.min(Math.max(now.getTime() - from, 0), total);
    if (elapsed <= 0 || total <= 0) return null;
    return (spendUsd / elapsed) * total;
}
