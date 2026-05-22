import "server-only";

import { db } from "@/lib/db";
import { drizzleAlertChannelRepository } from "../notification/drizzle-alert-channel.repository";
import type { ChannelHealthRow } from "./channel-health";
import { channelHealthFromSources } from "./channel-health-query";
import { drizzleNotificationDeliveriesRepository } from "./notification-deliveries.repository";
import {
    drizzleNotificationsRepository,
    type NotificationsRepository,
} from "./notifications.repository";
import type { NotificationDisplay, NotificationItem, NotificationSource } from "./types";

const ANOMALY_RULE_KIND = "anomaly";
const BUDGET_RULE_KIND = "budget";

let testRepoOverride: NotificationsRepository | null = null;

/** Test-only seam. */
export function setNotificationsRepoForTesting(repo: NotificationsRepository | null): void {
    testRepoOverride = repo;
}

function repo(): NotificationsRepository {
    return testRepoOverride ?? drizzleNotificationsRepository(db());
}

export interface ListNotificationsInput {
    readonly userId: string;
    readonly workspaceId?: string;
    readonly sources?: readonly NotificationSource[];
    readonly display?: NotificationDisplay;
}

export async function listNotifications(
    input: ListNotificationsInput,
): Promise<readonly NotificationItem[]> {
    const rows = await repo().listForUser({
        userId: input.userId,
        ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
        ...(input.sources !== undefined ? { sources: input.sources } : {}),
        ...(input.display !== undefined ? { display: input.display } : {}),
    });
    return rows.map((row) => ({
        id: row.id,
        workspaceName: row.workspaceName,
        source: row.source,
        dedupKey: row.dedupKey,
        severity: row.severity,
        title: row.title,
        body: row.body,
        createdAt: row.createdAt.toISOString(),
        href: row.href,
        read: row.readAt !== null,
        display: row.display,
    }));
}

export async function markNotificationsRead(input: {
    userId: string;
    itemIds: readonly string[] | "all";
}): Promise<void> {
    const now = new Date();
    const notifications = repo();
    if (input.itemIds === "all") {
        await notifications.markAllRead({ userId: input.userId, now });
        return;
    }
    if (input.itemIds.length === 0) return;
    await notifications.markRead({ userId: input.userId, ids: input.itemIds, now });
}

/**
 * Aggregates the workspace's configured Slack/Discord channels (across
 * both anomaly and budget alert rules) with the latest per-attempt
 * delivery info. Deduped by kind so two rules with the same webhook
 * surface as one row.
 */
export async function getChannelHealth(
    workspaceId: string,
    now: Date = new Date(),
): Promise<readonly ChannelHealthRow[]> {
    const channels = drizzleAlertChannelRepository(db());
    const [anomaly, budget] = await Promise.all([
        channels.listForRuleKind(workspaceId, ANOMALY_RULE_KIND),
        channels.listForRuleKind(workspaceId, BUDGET_RULE_KIND),
    ]);
    return channelHealthFromSources({
        workspaceId,
        configuredChannels: [...anomaly, ...budget],
        deliveries: drizzleNotificationDeliveriesRepository(db()),
        now,
    });
}
