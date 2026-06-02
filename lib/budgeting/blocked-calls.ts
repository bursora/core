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
import { safeCount } from "@/lib/clickhouse/decode";
import { buildClickHouseMeteringWhere } from "@/lib/metering/clickhouse-usage-events-filters";

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

export async function getBlockedCallsLastDay(
    query: BlockedCallsQuery,
): Promise<BlockedCallsLastDay> {
    const { conditions, params } = buildClickHouseMeteringWhere({
        workspaceId: query.workspaceId,
        status: "blocked",
    });
    conditions.push("toUnixTimestamp64Milli(ts) >= {dayStartMs:Int64}");
    params.dayStartMs = query.now.getTime() - DAY_MS;
    params.hourStartMs = query.now.getTime() - HOUR_MS;

    const [row] = await query.ch.query<{ last_day: string; last_hour: string }>({
        query: `SELECT
                count() AS last_day,
                countIf(toUnixTimestamp64Milli(ts) >= {hourStartMs:Int64}) AS last_hour
            FROM usage_events
            WHERE ${conditions.join(" AND ")}`,
        query_params: params,
    });

    return {
        lastDay: safeCount(row?.last_day),
        lastHour: safeCount(row?.last_hour),
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
    const { conditions, params } = buildClickHouseMeteringWhere({
        workspaceId: query.workspaceId,
        status: "blocked",
    });
    conditions.push("toUnixTimestamp64Milli(ts) >= {sinceMs:Int64}");
    params.sinceMs = query.since.getTime();

    const [row] = await query.ch.query<{ count: string }>({
        query: `SELECT count() AS count
            FROM usage_events
            WHERE ${conditions.join(" AND ")}`,
        query_params: params,
    });

    return safeCount(row?.count);
}
