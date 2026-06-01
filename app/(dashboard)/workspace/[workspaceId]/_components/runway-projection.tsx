/**
 * Runway projection hero. Shows the linearly-extrapolated end-of-month
 * spend in giant tabular numerals, with a vs-last-month delta, a percent-of-cap
 * breakdown, and a forecast-confidence line.
 *
 * The cap denominator comes from `getMonthlySpendCap`: a workspace-scope
 * monthly budget when present, otherwise `null` (the percentage line renders
 * as "no monthly cap").
 */

import { RunwayProjectionView } from "@/components/ui/dashboard-views/runway-projection-view";
import {
    computeDelta,
    confidenceLabel,
    getMonthlySpendCap,
    getProjectedEom,
} from "@/lib/dashboard/dashboard-stats";

interface RunwayProjectionProps {
    readonly workspaceId: string;
}

export async function RunwayProjection({ workspaceId }: RunwayProjectionProps) {
    const now = new Date();
    const [projection, cap] = await Promise.all([
        getProjectedEom({ workspaceId, now }),
        getMonthlySpendCap(workspaceId),
    ]);

    const hasPriorMonth = projection.priorMonth > 0;
    const vsLastMonth = hasPriorMonth
        ? computeDelta(projection.projected, projection.priorMonth)
        : null;
    const capRatio = cap !== null && cap > 0 ? projection.projected / cap : null;

    return (
        <RunwayProjectionView
            projected={projection.projected}
            vsLastMonth={vsLastMonth}
            cap={cap}
            capRatio={capRatio}
            confidence={confidenceLabel(projection.daysElapsed)}
        />
    );
}
