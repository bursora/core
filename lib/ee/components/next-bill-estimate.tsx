/**
 * Month-to-date bill estimate.
 *
 * Server-rendered each settings page load. The two components are stacked:
 *   - percentage: 0.5% of tracked LLM spend so far this month, clamped
 *                 $29 floor / $499 cap
 *   - overage:   events past the 5M bundle at $0.30 per 1K
 *
 * `next-bill` deliberately doesn't poll. Settings pages are visited
 * infrequently and the dashboard's spend chart is where customers go to
 * watch usage in real time. A server render at page-view captures the
 * latest aggregate; users who want a live view click Refresh.
 */

import { getNextBillEstimate } from "../billing/server";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { formatCount, formatUsd } from "@/lib/format";

interface NextBillEstimateProps {
    readonly workspaceId: string;
}

export async function NextBillEstimate({ workspaceId }: NextBillEstimateProps) {
    const estimate = await getNextBillEstimate({ workspaceId });
    if (!estimate) return null;

    return (
        <DashboardSection label="Next bill estimate" sublabel={estimate.month}>
            <dl className="grid gap-3 sm:grid-cols-3">
                <Stat
                    label="Platform fee (0.5%)"
                    value={formatCentsAsUsd(estimate.percentageCents)}
                />
                <Stat
                    label="Event overage"
                    value={
                        estimate.overageCents > 0 ? formatCentsAsUsd(estimate.overageCents) : "—"
                    }
                />
                <Stat
                    label="Estimated total"
                    value={formatCentsAsUsd(estimate.totalCents)}
                    emphasis
                />
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">
                Tracked LLM spend: {formatCentsAsUsd(estimate.trackedSpendCents)} —{" "}
                {formatCount(estimate.eventsCount)} events this cycle. Invoiced on the 1st of next
                month.
            </p>
        </DashboardSection>
    );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
    return (
        <div>
            <dt className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                {label}
            </dt>
            <dd
                className={
                    emphasis
                        ? "mt-1 text-2xl font-semibold text-foreground"
                        : "mt-1 text-xl font-medium text-foreground"
                }
            >
                {value}
            </dd>
        </div>
    );
}

function formatCentsAsUsd(cents: number): string {
    return formatUsd(cents / 100);
}
