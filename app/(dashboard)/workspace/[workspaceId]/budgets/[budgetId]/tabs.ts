/**
 * Budget detail tab descriptors. Server-safe (no React, no client hooks) so
 * `page.tsx` can resolve the active tab during server rendering without
 * pulling the client-only TabsClient module across the RSC boundary.
 */

export const BUDGET_DETAIL_TABS = ["overview", "blocks"] as const;
export type BudgetDetailTab = (typeof BUDGET_DETAIL_TABS)[number];

export const BUDGET_DETAIL_TAB_LABELS: Record<BudgetDetailTab, string> = {
    overview: "Overview",
    blocks: "Blocks",
};

export function resolveBudgetDetailTab(value: string | null | undefined): BudgetDetailTab {
    return BUDGET_DETAIL_TABS.find((t) => t === value) ?? BUDGET_DETAIL_TABS[0];
}
