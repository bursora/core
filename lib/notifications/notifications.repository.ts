import "server-only";

import type { Db } from "@/lib/db";
import { notifications, workspaces } from "@/lib/db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { NotificationDisplay, NotificationSeverity, NotificationSource } from "./types";

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
     */
    listForUser(input: {
        userId: string;
        workspaceId?: string;
        sources?: readonly NotificationSource[];
        includeRead?: boolean;
        display?: NotificationDisplay;
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

        async listForUser({ userId, workspaceId, sources, includeRead, display }) {
            const conditions = [eq(notifications.userId, userId)];
            if (workspaceId !== undefined) {
                conditions.push(eq(notifications.workspaceId, workspaceId));
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
            const rows = await db
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
                .orderBy(desc(notifications.createdAt));
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
