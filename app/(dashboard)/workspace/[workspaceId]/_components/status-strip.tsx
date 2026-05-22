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
    type ChannelTone,
    type HeartbeatTone,
} from "@/app/(dashboard)/workspace/[workspaceId]/_lib/status-strip-helpers";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRelativeTime } from "@/lib/format";
import { getLastUsageEventAt } from "@/lib/metering/server";
import {
    getChannelHealth,
    listNotifications,
    type ChannelHealthRow,
    type NotificationChannelKind,
    type NotificationItem,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

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

const TONE_TEXT: Record<HeartbeatTone, string> = {
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
};

const TONE_DOT_BG: Record<HeartbeatTone, string> = {
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
    muted: "bg-muted-foreground/40",
};

const CHANNEL_LABEL: Record<NotificationChannelKind, string> = {
    slack: "SLACK",
    discord: "DISCORD",
    email: "EMAIL",
};

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

        const tone = heartbeatTone(lastAt, now);
        const setupCount = items.length;
        const setupTone: HeartbeatTone = setupCount > 0 ? "destructive" : "muted";

        return (
            <TooltipProvider>
                <div className="flex h-6 items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                    <span className="inline-flex items-center gap-1.5">
                        <span>SDK</span>
                        <span
                            aria-hidden="true"
                            className={cn("inline-block size-1.5 rounded-full", TONE_DOT_BG[tone])}
                        />
                        <span
                            className={cn(
                                "normal-case tracking-normal tabular-nums",
                                TONE_TEXT[tone],
                            )}
                        >
                            {lastAt === null
                                ? "no events yet"
                                : formatRelativeTime(lastAt, now.getTime())}
                        </span>
                    </span>
                    {channels.length > 0 ? (
                        <>
                            <span className="text-muted-foreground/40">·</span>
                            {channels.map((channel, idx) => (
                                <ChannelDot
                                    key={channel.kind}
                                    channel={channel}
                                    now={now}
                                    showSeparator={idx > 0}
                                />
                            ))}
                        </>
                    ) : null}
                    <span className="text-muted-foreground/40">·</span>
                    <span className="inline-flex items-center gap-1.5">
                        <span>setup errors:</span>
                        <span className={cn("tabular-nums", TONE_TEXT[setupTone])}>
                            {setupCount}
                        </span>
                    </span>
                </div>
            </TooltipProvider>
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

interface ChannelDotProps {
    readonly channel: ChannelHealthRow;
    readonly now: Date;
    readonly showSeparator: boolean;
}

function ChannelDot({ channel, now, showSeparator }: ChannelDotProps) {
    const tone: ChannelTone = channelTone(channel, now);
    const tooltipText = renderTooltipText(channel, now);
    return (
        <>
            {showSeparator ? <span className="text-muted-foreground/40">·</span> : null}
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1.5" aria-label={tooltipText}>
                        <span>{CHANNEL_LABEL[channel.kind]}</span>
                        <span
                            aria-hidden="true"
                            className={cn("inline-block size-1.5 rounded-full", TONE_DOT_BG[tone])}
                        />
                        <span className="sr-only">{tooltipText}</span>
                    </span>
                </TooltipTrigger>
                <TooltipContent>{tooltipText}</TooltipContent>
            </Tooltip>
        </>
    );
}

function renderTooltipText(channel: ChannelHealthRow, now: Date): string {
    if (channel.lastAttemptAt === null) return "no deliveries yet";
    const when = formatRelativeTime(channel.lastAttemptAt, now.getTime());
    if (channel.lastStatus === "ok") return `last delivery: ${when} · ok`;
    const reason = channel.lastError ? ` (${channel.lastError})` : "";
    return `last delivery: ${when} · failed${reason}`;
}
