/**
 * Channel-health composition helper.
 *
 * Takes a workspace's configured Slack/Discord/email channels (read
 * upstream from `alert_rules.channels`) and joins them with the latest
 * `notification_deliveries` rows + a 24h failure count to produce the
 * `ChannelHealthRow[]` consumed by the dashboard status strip.
 *
 * Pure with respect to data sources: the deliveries reader is injected
 * so a fake exercises the dedupe / mapping logic without touching the
 * database. The drizzle-backed wrapper lives in `server.ts`.
 */

import type { AlertChannel } from "../notification/alert-channel";
import type { ChannelHealthRow, NotificationChannelKind } from "./channel-health";
import type { NotificationDeliveriesReader } from "./notification-deliveries.repository";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHANNEL_KINDS: readonly NotificationChannelKind[] = ["slack", "discord", "email"];

export interface ChannelHealthFromSourcesInput {
    readonly workspaceId: string;
    readonly configuredChannels: readonly AlertChannel[];
    readonly deliveries: NotificationDeliveriesReader;
    readonly now: Date;
}

export async function channelHealthFromSources(
    input: ChannelHealthFromSourcesInput,
): Promise<readonly ChannelHealthRow[]> {
    const configuredKinds = dedupedChannelKinds(input.configuredChannels);
    if (configuredKinds.length === 0) return [];

    const since = new Date(input.now.getTime() - DAY_MS);
    const [latest, failureCounts] = await Promise.all([
        input.deliveries.latestPerKind(input.workspaceId, configuredKinds),
        input.deliveries.countFailuresSince(input.workspaceId, configuredKinds, since),
    ]);

    return configuredKinds.map((kind) => {
        const last = latest.get(kind);
        return {
            kind,
            lastAttemptAt: last?.attemptedAt ?? null,
            lastStatus: last?.status ?? null,
            lastError: last?.error ?? null,
            recentFailureCount: failureCounts.get(kind) ?? 0,
        };
    });
}

function dedupedChannelKinds(
    channels: readonly AlertChannel[],
): readonly NotificationChannelKind[] {
    const seen = new Set<NotificationChannelKind>();
    for (const c of channels) seen.add(c.kind);
    // Stable order so the strip always renders Slack, Discord, Email.
    return CHANNEL_KINDS.filter((k) => seen.has(k));
}
