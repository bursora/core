import "server-only";

import type { Db } from "@/lib/db";
import { notificationDeliveries } from "@/lib/db";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { NotificationChannelKind, NotificationDeliveryStatus } from "./channel-health";

/**
 * Row shape persisted to / read from `notification_deliveries`.
 *
 * `target` is intentionally NOT exposed on read. It lives only on the
 * persisted row (as a SHA-256 hash) and is used for upstream debugging
 * via direct SQL when needed. The dashboard surface never displays it.
 */
export interface NotificationDeliveryRecord {
    readonly workspaceId: string;
    readonly kind: NotificationChannelKind;
    readonly status: NotificationDeliveryStatus;
    readonly error: string | null;
    readonly attemptedAt: Date;
}

export interface InsertNotificationDeliveryInput {
    readonly workspaceId: string;
    readonly kind: NotificationChannelKind;
    readonly targetHash: string;
    readonly status: NotificationDeliveryStatus;
    readonly error: string | null;
    readonly latencyMs: number | null;
}

export interface NotificationDeliveriesReader {
    latestPerKind(
        workspaceId: string,
        kinds: readonly NotificationChannelKind[],
    ): Promise<ReadonlyMap<NotificationChannelKind, NotificationDeliveryRecord>>;
    countFailuresSince(
        workspaceId: string,
        kinds: readonly NotificationChannelKind[],
        since: Date,
    ): Promise<ReadonlyMap<NotificationChannelKind, number>>;
}

export interface NotificationDeliveriesWriter {
    insert(input: InsertNotificationDeliveryInput): Promise<void>;
}

export type NotificationDeliveriesRepository = NotificationDeliveriesReader &
    NotificationDeliveriesWriter;

export function drizzleNotificationDeliveriesRepository(db: Db): NotificationDeliveriesRepository {
    return {
        async insert(input) {
            await db.insert(notificationDeliveries).values({
                workspaceId: input.workspaceId,
                channelKind: input.kind,
                target: input.targetHash,
                status: input.status,
                error: input.error,
                latencyMs: input.latencyMs,
            });
        },

        async latestPerKind(workspaceId, kinds) {
            const out = new Map<NotificationChannelKind, NotificationDeliveryRecord>();
            if (kinds.length === 0) return out;
            // One SELECT per kind keeps the query indexable on the composite
            // (workspace_id, channel_kind, attempted_at desc) index. A DISTINCT
            // ON would also work but Drizzle's typed builder leans cleaner here.
            for (const kind of kinds) {
                const rows = await db
                    .select({
                        channelKind: notificationDeliveries.channelKind,
                        status: notificationDeliveries.status,
                        error: notificationDeliveries.error,
                        attemptedAt: notificationDeliveries.attemptedAt,
                    })
                    .from(notificationDeliveries)
                    .where(
                        and(
                            eq(notificationDeliveries.workspaceId, workspaceId),
                            eq(notificationDeliveries.channelKind, kind),
                        ),
                    )
                    .orderBy(desc(notificationDeliveries.attemptedAt))
                    .limit(1);
                const r = rows[0];
                if (!r) continue;
                out.set(kind, {
                    workspaceId,
                    kind: r.channelKind as NotificationChannelKind,
                    status: r.status as NotificationDeliveryStatus,
                    error: r.error,
                    attemptedAt: r.attemptedAt,
                });
            }
            return out;
        },

        async countFailuresSince(workspaceId, kinds, since) {
            const out = new Map<NotificationChannelKind, number>();
            for (const kind of kinds) out.set(kind, 0);
            if (kinds.length === 0) return out;
            const rows = await db
                .select({
                    channelKind: notificationDeliveries.channelKind,
                    n: sql<number>`count(*)::int`,
                })
                .from(notificationDeliveries)
                .where(
                    and(
                        eq(notificationDeliveries.workspaceId, workspaceId),
                        inArray(notificationDeliveries.channelKind, [...kinds]),
                        eq(notificationDeliveries.status, "failed"),
                        gte(notificationDeliveries.attemptedAt, since),
                    ),
                )
                .groupBy(notificationDeliveries.channelKind);
            for (const r of rows) {
                out.set(r.channelKind as NotificationChannelKind, Number(r.n));
            }
            return out;
        },
    };
}
