/**
 * Blocked-call rollups for the dashboard.
 *
 * Reads `usage_events` rows tagged `status='blocked'` (stamped by
 * `decideBudgetUseCase` on every block trip) and returns two scalar counters:
 * the last hour and the last 24 hours. One pass over the rolling 24h window;
 * the 1h count comes from a CASE-fold inside the same query.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { and, eq, gte, sql } from "drizzle-orm";

export interface BlockedCallsLastDay {
    readonly lastHour: number;
    readonly lastDay: number;
}

export interface BlockedCallsQuery {
    readonly db: Db;
    readonly workspaceId: string;
    readonly now: Date;
}

export async function getBlockedCallsLastDay(
    query: BlockedCallsQuery,
): Promise<BlockedCallsLastDay> {
    const dayStart = new Date(query.now.getTime() - 24 * 60 * 60 * 1000);
    const hourStart = new Date(query.now.getTime() - 60 * 60 * 1000);

    const [row] = await query.db
        .select({
            lastDay: sql<string>`COUNT(*)`,
            lastHour: sql<string>`COUNT(*) FILTER (WHERE ${schema.usageEvents.ts} >= ${hourStart.toISOString()}::timestamptz)`,
        })
        .from(schema.usageEvents)
        .where(
            and(
                eq(schema.usageEvents.workspaceId, query.workspaceId),
                eq(schema.usageEvents.status, "blocked"),
                gte(schema.usageEvents.ts, dayStart),
            ),
        );

    return {
        lastDay: Number(row?.lastDay ?? 0),
        lastHour: Number(row?.lastHour ?? 0),
    };
}

/**
 * Count of blocked rows since a trip's `raisedAt`. Drives the "N calls
 * denied since trip" enrichment line in budget notifications.
 */
export interface CountBlockedSinceTripQuery {
    readonly db: Db;
    readonly workspaceId: string;
    readonly since: Date;
}

export async function countBlockedSinceTrip(query: CountBlockedSinceTripQuery): Promise<number> {
    const [row] = await query.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(schema.usageEvents)
        .where(
            and(
                eq(schema.usageEvents.workspaceId, query.workspaceId),
                eq(schema.usageEvents.status, "blocked"),
                gte(schema.usageEvents.ts, query.since),
            ),
        );

    return Number(row?.count ?? 0);
}
