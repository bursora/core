/**
 * Server-side loader for the "What breaks first" dashboard panel.
 *
 * Composes the budget-headroom + projected $/day helpers and feeds the pure
 * helper in `lib/budgeting/whats-breaking.ts`. Returns the sorted row array
 * the panel renders, plus the upstream projection + MTD context the Runway
 * timeline needs for its prior-month-matched tick (so it does not re-query).
 */

import {
    getBudgetHeadroom,
    getProjectedEom,
    getSpendMtd,
} from "@/lib/dashboard/dashboard-stats";
import { withRequestMemo } from "@/lib/dashboard/per-request-cache";
import { computeWhatsBreaking, type WhatsBreakingRow } from "@/lib/budgeting";

const HEADROOM_FETCH_LIMIT = 50;

export interface WhatsBreakingResult {
    readonly rows: readonly WhatsBreakingRow[];
    /** Daily burn rate `$/day` from the linear MTD projection. */
    readonly dailyRate: number;
    /** Total spend in the prior calendar month, in dollars. */
    readonly priorMonth: number;
    /** Month-to-date spend, in dollars. */
    readonly mtd: number;
}

async function getWhatsBreakingImpl(
    workspaceId: string,
    now: Date = new Date(),
): Promise<WhatsBreakingResult> {
    const [headroom, projection, mtdSpendStr] = await Promise.all([
        getBudgetHeadroom({ workspaceId, limit: HEADROOM_FETCH_LIMIT, now }),
        getProjectedEom({ workspaceId, now }),
        getSpendMtd({ workspaceId, now }),
    ]);

    const mtd = Number.parseFloat(mtdSpendStr) || 0;

    const rows = computeWhatsBreaking({
        budgets: headroom.map((r) => ({
            id: r.id,
            scopeType: r.scopeType,
            scopeId: r.scopeId,
            period: r.period,
            mode: r.mode,
            limit: r.limit,
            spent: r.spent,
            usage: r.usage,
        })),
        dailyRate: projection.dailyRate,
        now,
    });

    return {
        rows,
        dailyRate: projection.dailyRate,
        priorMonth: projection.priorMonth,
        mtd,
    };
}

export const getWhatsBreaking = withRequestMemo(getWhatsBreakingImpl);
