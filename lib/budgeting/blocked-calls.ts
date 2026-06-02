/**
 * Blocked-call rollups for the dashboard.
 *
 * Reads `usage_events` rows tagged `status='blocked'` (stamped by
 * `decideBudgetUseCase` on every block trip) from the canonical ClickHouse
 * store and returns two scalar counters: the last hour and the last 24 hours.
 * One pass over the rolling 24h window; the 1h count comes from a `countIf`
 * inside the same query.
 */

import "server-only";

import type { ClickHouse } from "@/lib/clickhouse/client";

export interface BlockedCallsLastDay {
    readonly lastHour: number;
    readonly lastDay: number;
}

export interface BlockedCallsQuery {
    readonly ch: ClickHouse;
    readonly workspaceId: string;
    readonly now: Date;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const toCount = (n: string | number | null | undefined): number => {
    const v = n === null || n === undefined ? 0 : Number(n);
    return Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0;
};

export async function getBlockedCallsLastDay(
    query: BlockedCallsQuery,
): Promise<BlockedCallsLastDay> {
    const dayStartMs = query.now.getTime() - DAY_MS;
    const hourStartMs = query.now.getTime() - HOUR_MS;

    const [row] = await query.ch.query<{ last_day: string; last_hour: string }>({
        query: `SELECT
                count() AS last_day,
                countIf(toUnixTimestamp64Milli(ts) >= {hourStartMs:Int64}) AS last_hour
            FROM usage_events
            WHERE workspace_id = {workspaceId:UUID}
                AND status = 'blocked'
                AND toUnixTimestamp64Milli(ts) >= {dayStartMs:Int64}`,
        query_params: {
            workspaceId: query.workspaceId,
            dayStartMs,
            hourStartMs,
        },
    });

    return {
        lastDay: toCount(row?.last_day),
        lastHour: toCount(row?.last_hour),
    };
}

/**
 * Count of blocked rows since a trip's `raisedAt`. Drives the "N calls
 * denied since trip" enrichment line in budget notifications.
 */
export interface CountBlockedSinceTripQuery {
    readonly ch: ClickHouse;
    readonly workspaceId: string;
    readonly since: Date;
}

export async function countBlockedSinceTrip(query: CountBlockedSinceTripQuery): Promise<number> {
    const [row] = await query.ch.query<{ count: string }>({
        query: `SELECT count() AS count
            FROM usage_events
            WHERE workspace_id = {workspaceId:UUID}
                AND status = 'blocked'
                AND toUnixTimestamp64Milli(ts) >= {sinceMs:Int64}`,
        query_params: {
            workspaceId: query.workspaceId,
            sinceMs: query.since.getTime(),
        },
    });

    return toCount(row?.count);
}
