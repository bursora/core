"use server";

import { withWorkspace } from "@/lib/actions/with-workspace";
import { getBudget, getBudgetStats } from "@/lib/budgeting/server";
import type { BlockedEventRow } from "@/lib/metering";
import { listBlockedEventsForBudget } from "@/lib/metering/server";

const BLOCKS_PAGE_LIMIT = 50;

export interface LoadMoreBlocksInput {
    readonly workspaceId: string;
    readonly budgetId: string;
    readonly cursor: string;
}

export interface LoadMoreBlocksResult {
    readonly items: readonly BlockedEventRow[];
    readonly nextCursor: string | null;
}

export const loadMoreBlocksAction = withWorkspace(
    async (_ctx, input: LoadMoreBlocksInput): Promise<LoadMoreBlocksResult> => {
        const budget = await getBudget(input.workspaceId, input.budgetId);
        if (budget === null) return { items: [], nextCursor: null };
        const statsByBudget = await getBudgetStats(input.workspaceId, [budget]);
        const stats = statsByBudget[budget.id];
        if (stats === undefined) return { items: [], nextCursor: null };
        const page = await listBlockedEventsForBudget({
            workspaceId: input.workspaceId,
            budgetId: budget.id,
            from: new Date(stats.periodFromIso),
            to: new Date(stats.periodToIso),
            limit: BLOCKS_PAGE_LIMIT,
            cursor: input.cursor,
        });
        return { items: page.items, nextCursor: page.nextCursor };
    },
    { getWorkspaceId: (input) => input.workspaceId },
);
