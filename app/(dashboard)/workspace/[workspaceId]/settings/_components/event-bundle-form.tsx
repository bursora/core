/**
 * Workspace event-bundle usage panel.
 *
 * The 5M events/month bundle is a fixed fair-use cap with flat pricing —
 * there's nothing to configure. This shows the current cycle's usage so
 * operators can see where they stand against the cap. Past it, tracking
 * keeps working and we reach out; ingest is never blocked.
 */

import { formatCount } from "@/lib/format";

interface EventBundleFormProps {
    readonly eventsCount: number;
    readonly bundleEvents: number;
}

export function EventBundleForm({ eventsCount, bundleEvents }: EventBundleFormProps) {
    const remaining = Math.max(0, bundleEvents - eventsCount);

    return (
        <dl className="grid grid-cols-3 gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
            <Stat label="This cycle" value={`${formatCount(eventsCount)} events`} />
            <Stat label="Fair-use cap" value={`${formatCount(bundleEvents)} events`} />
            <Stat label="Cap left" value={formatCount(remaining)} />
        </dl>
    );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
    return (
        <div>
            <dt className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                {label}
            </dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">{value}</dd>
        </div>
    );
}
