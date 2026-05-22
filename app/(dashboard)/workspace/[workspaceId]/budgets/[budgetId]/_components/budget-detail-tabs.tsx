"use client";

import {
    BUDGET_DETAIL_TABS,
    BUDGET_DETAIL_TAB_LABELS,
    type BudgetDetailTab,
} from "@/app/(dashboard)/workspace/[workspaceId]/budgets/[budgetId]/tabs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusTag } from "@/components/ui/workspace/status-tag";
import { buildWorkspacePath } from "@/lib/routes";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, type ReactNode } from "react";

interface BudgetDetailTabsProps {
    readonly workspaceId: string;
    readonly budgetId: string;
    readonly activeTab: BudgetDetailTab;
    readonly blockedCount: number;
    readonly panels: Record<BudgetDetailTab, ReactNode>;
}

export function BudgetDetailTabs({
    workspaceId,
    budgetId,
    activeTab,
    blockedCount,
    panels,
}: BudgetDetailTabsProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const onChange = useCallback(
        (next: string) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("tab", next);
            const query = Object.fromEntries(params.entries());
            router.replace(
                buildWorkspacePath(workspaceId, `budgets/${encodeURIComponent(budgetId)}`, query),
            );
        },
        [router, searchParams, workspaceId, budgetId],
    );

    return (
        <Tabs value={activeTab} onValueChange={onChange} className="w-full">
            <TabsList>
                {BUDGET_DETAIL_TABS.map((t) => (
                    <TabsTrigger key={t} value={t}>
                        <span>{BUDGET_DETAIL_TAB_LABELS[t]}</span>
                        {t === "blocks" && blockedCount > 0 ? (
                            <StatusTag tone="muted" variant="pill" className="ml-1.5">
                                {blockedCount}
                            </StatusTag>
                        ) : null}
                    </TabsTrigger>
                ))}
            </TabsList>
            {BUDGET_DETAIL_TABS.map((t) => (
                <TabsContent key={t} value={t} className="mt-4">
                    {panels[t]}
                </TabsContent>
            ))}
        </Tabs>
    );
}
