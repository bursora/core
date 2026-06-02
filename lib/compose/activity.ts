import "server-only";

import { clickhouseClient, type ClickHouse } from "@/lib/clickhouse/client";
import { db } from "@/lib/db";
import type { AnomalyAlert } from "../detection";
import { drizzleAlertRepository } from "../detection";
import { DrizzleApiKeyRepository } from "../identity/drizzle-api-key.repository";
import {
    DEFAULT_ACTIVITY_LIMIT,
    listActivityPageUseCase,
    listActivityUseCase,
    type ActivityFilters,
    type ActivityItem,
    type ActivityPage,
    type EventBucket,
    type KeyEvent,
    type SetupErrorEvent,
} from "../metering";
import { summarizeSetupErrorsSince } from "../setup-errors/server";

export interface ActivityDeps {
    readonly fetchEventBuckets: (
        workspaceId: string,
        since: Date,
    ) => Promise<readonly EventBucket[]>;
    readonly fetchAlerts: (
        workspaceId: string,
        since: Date,
        limit: number,
    ) => Promise<readonly AnomalyAlert[]>;
    readonly fetchKeyEvents: (workspaceId: string, since: Date) => Promise<readonly KeyEvent[]>;
    readonly fetchSetupErrors?: (
        workspaceId: string,
        since: Date,
    ) => Promise<readonly SetupErrorEvent[]>;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Hourly call-count buckets for the activity feed sparkline. Reads the
 * canonical ClickHouse store: `status='ok'` rows at or after `since`, grouped
 * to the hour by epoch-millisecond division (the timezone-free analog of the PG
 * `date_trunc('hour', ts)`), newest bucket first. Each bucket is stamped at the
 * latest actual event time within it (`max(ts)`), not the hour floor, so a row
 * reads as the real time it happened rather than up to an hour stale.
 */
export async function fetchEventBuckets(
    ch: ClickHouse,
    workspaceId: string,
    since: Date,
): Promise<readonly EventBucket[]> {
    const rows = await ch.query<{ bucket_ms: string; last_ms: string; count: string }>({
        query: `SELECT
                intDiv(toUnixTimestamp64Milli(ts), {hourMs:Int64}) * {hourMs:Int64} AS bucket_ms,
                max(toUnixTimestamp64Milli(ts)) AS last_ms,
                count() AS count
            FROM usage_events
            WHERE workspace_id = {workspaceId:UUID}
                AND status = 'ok'
                AND toUnixTimestamp64Milli(ts) >= {sinceMs:Int64}
            GROUP BY bucket_ms
            ORDER BY bucket_ms DESC`,
        query_params: {
            workspaceId,
            sinceMs: since.getTime(),
            hourMs: HOUR_MS,
        },
    });
    return rows.map((r) => ({ at: new Date(Number(r.last_ms)), count: Number(r.count) }));
}

let testOverride: ActivityDeps | null = null;

export function setActivityDepsForTesting(deps: ActivityDeps | null): void {
    testOverride = deps;
}

export function activityDeps(): ActivityDeps {
    if (testOverride !== null) return testOverride;

    const apiKeys = new DrizzleApiKeyRepository(db());
    const alertRepo = drizzleAlertRepository(db());

    return {
        fetchEventBuckets: (workspaceId, since) =>
            fetchEventBuckets(clickhouseClient(), workspaceId, since),
        fetchAlerts: async (workspaceId, since, limit) => {
            const rows = await alertRepo.listForWorkspace({
                workspaceId,
                kind: "anomaly",
                since,
                limit,
            });
            return rows.filter((r): r is AnomalyAlert => r.kind === "anomaly");
        },
        fetchKeyEvents: async (workspaceId) => {
            const rows = await apiKeys.listByWorkspace(workspaceId, { includeRevoked: true });
            return rows.map((r) => ({
                id: r.id,
                createdAt: r.createdAt,
                revokedAt: r.revokedAt,
            }));
        },
        fetchSetupErrors: async (workspaceId, since) => {
            const sinceMs = Date.now() - since.getTime();
            const summary = await summarizeSetupErrorsSince(workspaceId, sinceMs);
            return [...summary.entries()].map(([category, { count, lastSeenAt }]) => ({
                category,
                count,
                at: lastSeenAt,
            }));
        },
    };
}

export async function listActivity(input: {
    workspaceId: string;
    limit?: number;
    now?: Date;
}): Promise<readonly ActivityItem[]> {
    const deps = activityDeps();
    return listActivityUseCase({
        workspaceId: input.workspaceId,
        limit: input.limit ?? DEFAULT_ACTIVITY_LIMIT,
        ...(input.now !== undefined ? { now: input.now } : {}),
        fetchEventBuckets: deps.fetchEventBuckets,
        fetchAlerts: deps.fetchAlerts,
        fetchKeyEvents: deps.fetchKeyEvents,
        ...(deps.fetchSetupErrors ? { fetchSetupErrors: deps.fetchSetupErrors } : {}),
    });
}

export async function listActivityPage(input: {
    workspaceId: string;
    limit?: number;
    now?: Date;
    cursor?: string | null;
    filters?: ActivityFilters;
}): Promise<ActivityPage> {
    const deps = activityDeps();
    return listActivityPageUseCase({
        workspaceId: input.workspaceId,
        limit: input.limit ?? DEFAULT_ACTIVITY_LIMIT,
        ...(input.now !== undefined ? { now: input.now } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        ...(input.filters !== undefined ? { filters: input.filters } : {}),
        fetchEventBuckets: deps.fetchEventBuckets,
        fetchAlerts: deps.fetchAlerts,
        fetchKeyEvents: deps.fetchKeyEvents,
        ...(deps.fetchSetupErrors ? { fetchSetupErrors: deps.fetchSetupErrors } : {}),
    });
}
