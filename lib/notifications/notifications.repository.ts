import "server-only";

import type { Db } from "@/lib/db";
import { notifications, workspaces } from "@/lib/db/schema";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { NotificationDisplay, NotificationSeverity, NotificationSource } from "./types";

/**
 * Opaque cursor encoding `(createdAtMs, id)` for keyset pagination over
 * the `(createdAt DESC, id DESC)` ordering. The id tie-breaker ensures
 * rows sharing a timestamp don't get skipped or duplicated across pages.
 */
export interface NotificationsCursor {
    readonly createdAtMs: number;
    readonly id: string;
}

export function encodeNotificationsCursor(cursor: NotificationsCursor): string {
    return `${cursor.createdAtMs}:${cursor.id}`;
}

export function parseNotificationsCursor(
    raw: string | null | undefined,
): NotificationsCursor | null {
    if (raw === null || raw === undefined || raw === "") return null;
    const sep = raw.indexOf(":");
    if (sep <= 0 || sep === raw.length - 1) return null;
    const ms = Number.parseInt(raw.slice(0, sep), 10);
    const id = raw.slice(sep + 1);
    if (!Number.isFinite(ms) || id.length === 0) return null;
    return { createdAtMs: ms, id };
}

export interface InsertNotificationInput {
    readonly workspaceId: string;
    readonly userId: string;
    readonly source: NotificationSource;
    readonly dedupKey: string;
    readonly severity: NotificationSeverity;
    readonly title: string;
    readonly body: string;
    readonly href: string | null;
    readonly display?: NotificationDisplay;
}

export type NotificationRow = Omit<InsertNotificationInput, "display"> & {
    readonly id: string;
    readonly workspaceName: string;
    readonly createdAt: Date;
    readonly readAt: Date | null;
    readonly display: NotificationDisplay;
};

export interface NotificationsRepository {
    /**
     * Inserts the given notifications, skipping rows whose
     * (workspaceId, userId, dedupKey) already exists. Side-effect only —
     * callers don't read the inserted rows; the bell re-fetches on its own.
     */
    insertIgnore(inputs: readonly InsertNotificationInput[]): Promise<void>;
    /**
     * Lists notification rows for the user. `workspaceId` narrows to a single
     * workspace; omit it for the cross-workspace bell feed. `display` narrows
     * to one surface (`'banner'` for the workspace banner pipeline).
     *
     * `limit` caps how many rows the repository returns. `cursor` enables
     * keyset pagination over the `(createdAt DESC, id DESC)` ordering; rows
     * strictly older than the cursor are returned.
     *
     * `subscriptionStatuses`, when set, restricts results to workspaces whose
     * `subscription_status` is in the set. The cloud bell passes the active
     * set so a locked workspace's alert content never reaches the user through
     * the cross-workspace feed. Omit on self-host (no subscriptions).
     */
    listForUser(input: {
        userId: string;
        workspaceId?: string;
        sources?: readonly NotificationSource[];
        includeRead?: boolean;
        display?: NotificationDisplay;
        limit?: number;
        cursor?: NotificationsCursor;
        subscriptionStatuses?: readonly string[];
    }): Promise<readonly NotificationRow[]>;
    markRead(input: { userId: string; ids: readonly string[]; now: Date }): Promise<void>;
    markAllRead(input: { userId: string; now: Date }): Promise<void>;
}

export function drizzleNotificationsRepository(db: Db): NotificationsRepository {
    return {
        async insertIgnore(inputs) {
            if (inputs.length === 0) return;
            await db
                .insert(notifications)
                .values(
                    inputs.map((i) => ({
                        workspaceId: i.workspaceId,
                        userId: i.userId,
                        source: i.source,
                        dedupKey: i.dedupKey,
                        severity: i.severity,
                        title: i.title,
                        body: i.body,
                        href: i.href,
                        display: i.display ?? "inline",
                    })),
                )
                .onConflictDoNothing({
                    target: [
                        notifications.workspaceId,
                        notifications.userId,
                        notifications.dedupKey,
                    ],
                });
        },

        async listForUser({
            userId,
            workspaceId,
            sources,
            includeRead,
            display,
            limit,
            cursor,
            subscriptionStatuses,
        }) {
            const conditions = [eq(notifications.userId, userId)];
            if (workspaceId !== undefined) {
                conditions.push(eq(notifications.workspaceId, workspaceId));
            }
            if (subscriptionStatuses !== undefined) {
                // Cloud bell feed: only surface notifications from workspaces
                // with an active subscription. A locked workspace has a NULL or
                // non-active status, which `inArray` excludes, so its alert
                // content never leaks through the cross-workspace bell.
                conditions.push(
                    inArray(workspaces.subscriptionStatus, [...subscriptionStatuses]),
                );
            }
            if (sources && sources.length > 0) {
                conditions.push(inArray(notifications.source, [...sources]));
            }
            if (display !== undefined) {
                conditions.push(eq(notifications.display, display));
            }
            if (!includeRead) {
                conditions.push(isNull(notifications.readAt));
            }
            if (cursor !== undefined) {
                // Keyset over (createdAt DESC, id DESC): newer than the cursor.
                // Returns rows strictly "after" the cursor in the descending sort.
                const cursorAt = new Date(cursor.createdAtMs);
                const olderTime = sql`${notifications.createdAt} < ${cursorAt}`;
                const sameTimeOlderId = and(
                    sql`${notifications.createdAt} = ${cursorAt}`,
                    sql`${notifications.id} < ${cursor.id}`,
                );
                const cursorCondition = or(olderTime, sameTimeOlderId);
                if (cursorCondition !== undefined) conditions.push(cursorCondition);
            }
            const base = db
                .select({
                    id: notifications.id,
                    workspaceId: notifications.workspaceId,
                    userId: notifications.userId,
                    source: notifications.source,
                    dedupKey: notifications.dedupKey,
                    severity: notifications.severity,
                    title: notifications.title,
                    body: notifications.body,
                    href: notifications.href,
                    display: notifications.display,
                    createdAt: notifications.createdAt,
                    readAt: notifications.readAt,
                    workspaceName: workspaces.name,
                })
                .from(notifications)
                .innerJoin(workspaces, eq(notifications.workspaceId, workspaces.id))
                .where(and(...conditions))
                .orderBy(desc(notifications.createdAt), desc(notifications.id));
            const rows = limit !== undefined ? await base.limit(limit) : await base;
            return rows.map((r) => ({
                ...r,
                source: r.source as NotificationSource,
                severity: r.severity as NotificationSeverity,
                display: r.display as NotificationDisplay,
            }));
        },

        async markRead({ userId, ids, now }) {
            if (ids.length === 0) return;
            await db
                .update(notifications)
                .set({ readAt: now })
                .where(
                    and(
                        eq(notifications.userId, userId),
                        inArray(notifications.id, [...ids]),
                        isNull(notifications.readAt),
                    ),
                );
        },

        async markAllRead({ userId, now }) {
            await db
                .update(notifications)
                .set({ readAt: now })
                .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
        },
    };
}
