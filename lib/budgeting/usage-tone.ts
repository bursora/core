/**
 * Shared tone classes for budget usage bars and percent text.
 *
 * Two consumers in the dashboard render the same "how close are we to the
 * cap" signal: the headroom panel and the what-breaks-first stack. They
 * map the usage ratio to the same Tailwind classes via the same
 * thresholds, so they live here once.
 */

export const BUDGET_USAGE_WARN_THRESHOLD = 0.75;
export const BUDGET_USAGE_DANGER_THRESHOLD = 1;

/** Background fill class for the usage bar. */
export function budgetUsageBarTone(usage: number): string {
    if (usage >= BUDGET_USAGE_DANGER_THRESHOLD) return "bg-destructive";
    if (usage >= BUDGET_USAGE_WARN_THRESHOLD) return "bg-warning";
    return "bg-primary/70";
}

/** Text color class for the percent label adjacent to the bar. */
export function budgetUsageTextTone(usage: number): string {
    if (usage >= BUDGET_USAGE_DANGER_THRESHOLD) return "text-destructive";
    if (usage >= BUDGET_USAGE_WARN_THRESHOLD) return "text-warning";
    return "text-muted-foreground";
}
