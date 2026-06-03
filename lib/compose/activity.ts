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
        tz: string,
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

/**
 * Daily call-count buckets for the activity feed. Reads the canonical
 * ClickHouse store: `status='ok'` rows at or after `since`, grouped to the
 * viewer's local calendar day (`toStartOfDay(ts, tz)`), newest day first. Each
 * bucket is stamped at the latest actual event time within it (`max(ts)`), so a
 * row reads as the real time it happened. Day granularity (one row per active
 * day) keeps a wide date filter from overflowing the row limit; the UI renders
 * each day as a single "N events" row.
 */
export async function fetchEventBuckets(
    ch: ClickHouse,
    workspaceId: string,
    since: Date,
    tz: string,
): Promise<readonly EventBucket[]> {
    const rows = await ch.query<{ last_ms: string; count: string }>({
        query: `SELECT
                max(toUnixTimestamp64Milli(ts)) AS last_ms,
                count() AS count
            FROM usage_events
            WHERE workspace_id = {workspaceId:UUID}
                AND status = 'ok'
                AND toUnixTimestamp64Milli(ts) >= {sinceMs:Int64}
            GROUP BY toStartOfDay(ts, {tz:String})
            ORDER BY last_ms DESC`,
        query_params: {
            workspaceId,
            sinceMs: since.getTime(),
            tz,
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
        fetchEventBuckets: (workspaceId, since, tz) =>
            fetchEventBuckets(clickhouseClient(), workspaceId, since, tz),
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
    tz?: string;
}): Promise<readonly ActivityItem[]> {
    const deps = activityDeps();
    return listActivityUseCase({
        workspaceId: input.workspaceId,
        limit: input.limit ?? DEFAULT_ACTIVITY_LIMIT,
        ...(input.now !== undefined ? { now: input.now } : {}),
        ...(input.tz !== undefined ? { tz: input.tz } : {}),
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
    tz?: string;
}): Promise<ActivityPage> {
    const deps = activityDeps();
    return listActivityPageUseCase({
        workspaceId: input.workspaceId,
        limit: input.limit ?? DEFAULT_ACTIVITY_LIMIT,
        ...(input.now !== undefined ? { now: input.now } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        ...(input.filters !== undefined ? { filters: input.filters } : {}),
        ...(input.tz !== undefined ? { tz: input.tz } : {}),
        fetchEventBuckets: deps.fetchEventBuckets,
        fetchAlerts: deps.fetchAlerts,
        fetchKeyEvents: deps.fetchKeyEvents,
        ...(deps.fetchSetupErrors ? { fetchSetupErrors: deps.fetchSetupErrors } : {}),
    });
}
