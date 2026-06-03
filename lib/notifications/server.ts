import "server-only";

import { ACTIVE_SUBSCRIPTION_STATUSES } from "@/lib/billing-status";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { drizzleAlertChannelRepository } from "../notification/drizzle-alert-channel.repository";
import { UTC } from "../time/zone";
import type { ChannelHealthRow } from "./channel-health";
import { channelHealthFromSources } from "./channel-health-query";
import { drizzleNotificationDeliveriesRepository } from "./notification-deliveries.repository";
import {
    drizzleNotificationsRepository,
    encodeNotificationsCursor,
    parseNotificationsCursor,
    type NotificationsRepository,
} from "./notifications.repository";
import type { NotificationDisplay, NotificationItem, NotificationSource } from "./types";
import { localizeNotificationBody } from "./window-token";

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
    /** Viewer zone for localizing time tokens in bodies. Defaults to UTC. */
    readonly tz?: string;
}

function toNotificationItem(
    row: Awaited<ReturnType<NotificationsRepository["listForUser"]>>[number],
    tz: string,
): NotificationItem {
    return {
        id: row.id,
        workspaceName: row.workspaceName,
        source: row.source,
        dedupKey: row.dedupKey,
        severity: row.severity,
        title: row.title,
        body: localizeNotificationBody(row.body, tz),
        createdAt: row.createdAt.toISOString(),
        href: row.href,
        read: row.readAt !== null,
        display: row.display,
    };
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
    return rows.map((row) => toNotificationItem(row, input.tz ?? UTC));
}

export const DEFAULT_NOTIFICATIONS_PAGE_LIMIT = 50;
export const MAX_NOTIFICATIONS_PAGE_LIMIT = 100;

export interface ListNotificationsPageInput {
    readonly userId: string;
    readonly limit?: number;
    readonly cursor?: string | null;
    /** Viewer zone for localizing time tokens in bodies. Defaults to UTC. */
    readonly tz?: string;
}

export interface NotificationsPage {
    readonly items: readonly NotificationItem[];
    readonly nextCursor: string | null;
}

/**
 * Paginated cross-workspace feed for the bell. Caps the result set so a
 * user belonging to many workspaces can't blow the response. The cursor
 * encodes `(createdAt, id)` so rows sharing a timestamp page cleanly.
 */
export async function listNotificationsPage(
    input: ListNotificationsPageInput,
): Promise<NotificationsPage> {
    const limit = Math.min(
        input.limit ?? DEFAULT_NOTIFICATIONS_PAGE_LIMIT,
        MAX_NOTIFICATIONS_PAGE_LIMIT,
    );
    const cursor = parseNotificationsCursor(input.cursor);
    // Fetch limit+1 to detect "has more" without a second round-trip.
    const rows = await repo().listForUser({
        userId: input.userId,
        limit: limit + 1,
        ...(cursor !== null ? { cursor } : {}),
        // On cloud the bell is cross-workspace: never surface notifications from
        // a workspace without an active subscription, so a locked dashboard's
        // alert content never leaks through the bell. Self-host has no
        // subscriptions, so it shows everything.
        ...(env().IS_CLOUD ? { subscriptionStatuses: [...ACTIVE_SUBSCRIPTION_STATUSES] } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor =
        hasMore && last !== undefined
            ? encodeNotificationsCursor({ createdAtMs: last.createdAt.getTime(), id: last.id })
            : null;
    return { items: page.map((row) => toNotificationItem(row, input.tz ?? UTC)), nextCursor };
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
