/**
 * StatusStrip: single-row health strip rendered as the first element of
 * the dashboard. Surfaces:
 *   - the SDK heartbeat (color-coded dot + relative time)
 *   - one dot per configured Slack / Discord channel, tone-coded by
 *     the latest delivery health
 *   - a setup-errors counter
 *
 * `createStatusStrip(deps)` builds a server component wired to the supplied
 * loaders. The default `StatusStrip` export is bound to the production
 * loaders (metering + notifications module helpers); tests construct their
 * own instance via the factory with deterministic stubs.
 */

import {
    channelTone,
    heartbeatTone,
} from "@/app/(dashboard)/workspace/[workspaceId]/_lib/status-strip-helpers";
import {
    StatusStripView,
    type StatusStripChannelView,
} from "@/components/ui/dashboard-views/status-strip-view";
import { formatRelativeTime } from "@/lib/format";
import { getLastUsageEventAt } from "@/lib/metering/server";
import {
    getChannelHealth,
    listNotifications,
    type ChannelHealthRow,
    type NotificationItem,
} from "@/lib/notifications";

interface StatusStripProps {
    readonly workspaceId: string;
    readonly userId: string;
    readonly now?: Date;
}

export interface StatusStripDeps {
    readonly getLastEventAt: (workspaceId: string) => Promise<Date | null>;
    readonly listSetupNotifications: (input: {
        workspaceId: string;
        userId: string;
    }) => Promise<readonly NotificationItem[]>;
    readonly getChannelHealth: (workspaceId: string) => Promise<readonly ChannelHealthRow[]>;
}

export function createStatusStrip(deps: StatusStripDeps) {
    return async function StatusStrip(props: StatusStripProps) {
        const now = props.now ?? new Date();

        const [lastAt, items, channels] = await Promise.all([
            deps.getLastEventAt(props.workspaceId),
            deps.listSetupNotifications({
                workspaceId: props.workspaceId,
                userId: props.userId,
            }),
            deps.getChannelHealth(props.workspaceId),
        ]);

        const channelViews: readonly StatusStripChannelView[] = channels.map((channel) => ({
            kind: channel.kind,
            tone: channelTone(channel, now),
            tooltip: renderTooltipText(channel, now),
        }));

        return (
            <StatusStripView
                sdk={{
                    tone: heartbeatTone(lastAt, now),
                    label:
                        lastAt === null
                            ? "no events yet"
                            : formatRelativeTime(lastAt, now.getTime()),
                }}
                channels={channelViews}
                setupCount={items.length}
            />
        );
    };
}

/**
 * Production-bound StatusStrip. The dashboard page imports this name; the
 * factory is the test-facing seam, so production code never carries an
 * injection point of its own.
 */
export const StatusStrip = createStatusStrip({
    getLastEventAt: (workspaceId) => getLastUsageEventAt({ workspaceId }),
    listSetupNotifications: ({ workspaceId, userId }) =>
        listNotifications({
            workspaceId,
            userId,
            sources: ["setup_error"],
        }),
    getChannelHealth: (workspaceId) => getChannelHealth(workspaceId),
});

function renderTooltipText(channel: ChannelHealthRow, now: Date): string {
    if (channel.lastAttemptAt === null) return "no deliveries yet";
    const when = formatRelativeTime(channel.lastAttemptAt, now.getTime());
    if (channel.lastStatus === "ok") return `last delivery: ${when} · ok`;
    const reason = channel.lastError ? ` (${channel.lastError})` : "";
    return `last delivery: ${when} · failed${reason}`;
}
