/**
 * Workspace event-bundle usage panel.
 *
 * The 5M events/month bundle is a fixed fair-use cap with flat pricing —
 * there's nothing to configure. This shows the current cycle's usage as a
 * meter so operators can see where they stand against the cap. Past it,
 * tracking keeps working and we reach out; ingest is never blocked.
 */

import { ShareBar } from "@/components/ui/share-bar";
import type { EventBundleBannerLevel } from "@/lib/event-bundle/counter";
import { formatCount, formatDashboardPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface EventBundleFormProps {
    readonly eventsCount: number;
    readonly bundleEvents: number;
    readonly level: EventBundleBannerLevel;
}

const FILL_CLASS: Record<EventBundleBannerLevel, string> = {
    none: "bg-success/70",
    approaching: "bg-warning",
    exhausted: "bg-destructive",
};

const PERCENT_CLASS: Record<EventBundleBannerLevel, string> = {
    none: "text-muted-foreground",
    approaching: "text-warning",
    exhausted: "text-destructive",
};

export function EventBundleForm({ eventsCount, bundleEvents, level }: EventBundleFormProps) {
    const remaining = Math.max(0, bundleEvents - eventsCount);
    const ratio = bundleEvents > 0 ? eventsCount / bundleEvents : 0;

    return (
        <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-2 font-mono text-sm tabular-nums">
                <span>
                    <span className="font-semibold">{formatCount(eventsCount)}</span>
                    <span className="text-muted-foreground">
                        {" "}
                        / {formatCount(bundleEvents)} events
                    </span>
                </span>
                <span className={cn("text-xs font-medium", PERCENT_CLASS[level])}>
                    {formatDashboardPercent(ratio)}
                </span>
            </div>
            <ShareBar
                percent={ratio * 100}
                fillClassName={FILL_CLASS[level]}
                ariaLabel={`Event bundle usage: ${formatCount(eventsCount)} of ${formatCount(bundleEvents)} events this cycle`}
                className="h-2"
            />
            <p className="text-xs text-muted-foreground">
                {formatCount(remaining)} left this cycle. Past the cap we reach out; ingest never
                stops.
            </p>
        </div>
    );
}
