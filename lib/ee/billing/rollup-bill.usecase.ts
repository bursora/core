/**
 * Monthly usage rollup. The cron route (`/api/cron/billing-rollup`) calls
 * this on day 1 of every month at 00:00 UTC to close the previous month.
 *
 * For each workspace in the active set:
 *   - Read tracked LLM spend over [periodStart, periodEnd)
 *   - Read event count from the cold-store rollup (`workspace_event_bundle_usage`)
 *   - Compute bill, pro-rating floor/cap if this is the first month after signup
 *   - Hand off to `reportUsageUseCase` which posts a Lemon Squeezy usage
 *     record and persists `last_invoice_ref` + `last_billed_month`
 *
 * Workspaces are processed sequentially. Each workspace is wrapped in
 * `try / catch` so one provider failure doesn't kill the whole batch; the
 * summary counts failures and the cron logs them. Retries are owned by
 * the next-day re-run of the cron after a fix-forward — the usage-record
 * idempotency token derived from `(subscription, periodMonth)` lets LS
 * dedup duplicate posts on the same period.
 *
 * The "reference now" is whatever the caller passed in (the cron route
 * passes `new Date()`). The use case derives the billing month as the
 * calendar month immediately preceding `now`.
 */

import { overageCentsAt } from "@/lib/event-bundle/counter";
import { CAP_CENTS, FLOOR_CENTS, clampPercentage, rawPercentageCents } from "./calculate-bill";
import { daysActiveInclusive, daysInUtcMonth, prorateFraction } from "./prorate";
import { reportUsageUseCase } from "./report-usage.usecase";
import {
    type BillCalculationResult,
    type RollupBillUseCaseInput,
    type RollupBillUseCaseResult,
} from "./types";
import type { WorkspaceBillingRecord } from "./workspace-billing.repository";

export async function rollupBillUseCase(
    input: RollupBillUseCaseInput,
): Promise<RollupBillUseCaseResult> {
    const period = priorUtcMonth(input.now);
    const summary = { month: period.month, processed: 0, skipped: 0, failed: 0 };

    const ids = await input.trackedSpend.listActiveCloudWorkspaceIds();

    for (const workspaceId of ids) {
        try {
            const record = await input.workspaces.findById(workspaceId);
            if (!record) {
                summary.skipped += 1;
                continue;
            }
            if (record.lastBilledMonth === period.month) {
                // Retried cron after a previous successful push — skip.
                summary.skipped += 1;
                continue;
            }
            if (record.providerCustomerId === null) {
                summary.skipped += 1;
                continue;
            }
            if (
                record.subscriptionStatus === "canceled" ||
                record.subscriptionStatus === "expired"
            ) {
                // LS cancels at end-of-period; we flip subscriptionStatus to
                // `canceled` in the in-app refund path (and on the matching
                // webhook). Reporting more usage past that point would charge
                // for service the customer already got refunded.
                summary.skipped += 1;
                continue;
            }
            await billOneWorkspace({ input, period, record });
            summary.processed += 1;
        } catch (err) {
            console.error("billing.rollup.workspace_failed", {
                workspaceId,
                month: period.month,
                error: err instanceof Error ? err.message : String(err),
            });
            summary.failed += 1;
        }
    }

    return summary;
}

interface BillingPeriod {
    readonly month: string;
    readonly start: Date;
    readonly end: Date;
}

async function billOneWorkspace(args: {
    input: RollupBillUseCaseInput;
    period: BillingPeriod;
    record: WorkspaceBillingRecord;
}): Promise<void> {
    const { input, period, record } = args;
    if (record.providerCustomerId === null) return;

    const [trackedSpendCents, eventsCount] = await Promise.all([
        input.trackedSpend.sumMonthlySpendCents({
            workspaceId: record.workspaceId,
            from: period.start,
            to: period.end,
        }),
        input.eventBundleRollup.findEventsCount({
            workspaceId: record.workspaceId,
            month: period.month,
        }),
    ]);

    const bill = computeBillWithProration({
        trackedSpendCents,
        eventsCount,
        period,
        subscribedAt: record.subscribedAt,
    });
    if (bill.totalCents <= 0) return;

    await reportUsageUseCase({
        provider: input.provider,
        workspaces: input.workspaces,
        workspaceId: record.workspaceId,
        periodMonth: period.month,
        bill,
    });
}

/**
 * Compute the bill, applying pro-rated floor/cap for mid-month signups.
 *
 * Whole month: use the standard $29 / $499 envelope.
 * Partial month: shrink the envelope by `daysActive / daysInMonth` so a
 * signup on the 28th of a 31-day month sees a floor near $29 × (3/31).
 *
 * The percentage *raw* figure already scales with usage (it sums tracked
 * spend over the partial window), so only the clamp envelope needs
 * adjusting. Overage scales the same way and has no clamp.
 */
function computeBillWithProration(args: {
    trackedSpendCents: number;
    eventsCount: number;
    period: BillingPeriod;
    subscribedAt: Date | null;
}): BillCalculationResult {
    const raw = rawPercentageCents(args.trackedSpendCents);
    const over = overageCentsAt(args.eventsCount);

    if (args.subscribedAt === null || args.subscribedAt <= args.period.start) {
        const percentageCents = clampPercentage(raw, FLOOR_CENTS, CAP_CENTS);
        return {
            percentageCents,
            overageCents: over,
            totalCents: percentageCents + over,
        };
    }
    if (args.subscribedAt >= args.period.end) {
        return { percentageCents: 0, overageCents: 0, totalCents: 0 };
    }
    const fraction = prorateFraction({
        daysActive: daysActiveInclusive(args.subscribedAt, new Date(args.period.end.getTime() - 1)),
        daysInMonth: daysInUtcMonth(args.period.start),
    });
    const floor = Math.round(FLOOR_CENTS * fraction);
    const cap = Math.round(CAP_CENTS * fraction);
    const percentageCents = clampPercentage(raw, floor, cap);
    return {
        percentageCents,
        overageCents: over,
        totalCents: percentageCents + over,
    };
}

function priorUtcMonth(now: Date): BillingPeriod {
    const year = now.getUTCFullYear();
    const monthIdx = now.getUTCMonth(); // 0-indexed; "prior month" is monthIdx - 1
    const start = new Date(Date.UTC(year, monthIdx - 1, 1));
    const end = new Date(Date.UTC(year, monthIdx, 1));
    const y = start.getUTCFullYear();
    const m = (start.getUTCMonth() + 1).toString().padStart(2, "0");
    return { month: `${y}-${m}`, start, end };
}
