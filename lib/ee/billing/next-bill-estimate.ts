/**
 * Compute the current month-to-date bill estimate for one workspace.
 *
 * Shares the math with the monthly rollup so the customer sees exactly
 * what the next invoice will be. Reads:
 *   - tracked LLM spend for [monthStart, now)
 *   - event count from the cold-store rollup for the current month
 *
 * No pro-rating here — the next-bill estimate always describes what the
 * customer would pay if the cycle ended at the wall clock right now. The
 * rollup cron applies pro-ration when the cycle actually closes.
 */

import { monthKey } from "@/lib/event-bundle/counter";
import { calculateMonthlyBill } from "./calculate-bill";
import type { NextBillEstimate, NextBillEstimateUseCaseInput } from "./types";

export async function nextBillEstimateUseCase(
    input: NextBillEstimateUseCaseInput,
): Promise<NextBillEstimate> {
    const month = monthKey(input.now);
    const periodStart = startOfUtcMonth(input.now);
    const [trackedSpendCents, eventsCount] = await Promise.all([
        input.trackedSpend.sumMonthlySpendCents({
            workspaceId: input.workspaceId,
            from: periodStart,
            to: input.now,
        }),
        input.eventBundleRollup.findEventsCount({ workspaceId: input.workspaceId, month }),
    ]);
    const bill = calculateMonthlyBill({ trackedSpendCents, eventsCount });
    return {
        month,
        trackedSpendCents,
        eventsCount,
        percentageCents: bill.percentageCents,
        overageCents: bill.overageCents,
        totalCents: bill.totalCents,
    };
}

function startOfUtcMonth(at: Date): Date {
    return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}
