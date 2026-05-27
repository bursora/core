import "server-only";

import { db } from "@/lib/db";
import { usageEvents } from "@/lib/db/schema";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
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

let testOverride: ActivityDeps | null = null;

export function setActivityDepsForTesting(deps: ActivityDeps | null): void {
    testOverride = deps;
}

export function activityDeps(): ActivityDeps {
    if (testOverride !== null) return testOverride;

    const apiKeys = new DrizzleApiKeyRepository(db());
    const alertRepo = drizzleAlertRepository(db());

    return {
        fetchEventBuckets: async (workspaceId, since) => {
            const bucket = sql<Date | string>`date_trunc('hour', ${usageEvents.ts})`;
            const rows = await db()
                .select({ bucket, count: count() })
                .from(usageEvents)
                .where(
                    and(
                        eq(usageEvents.workspaceId, workspaceId),
                        eq(usageEvents.status, "ok"),
                        gte(usageEvents.ts, since),
                    ),
                )
                .groupBy(bucket)
                .orderBy(desc(bucket));
            return rows.map((r) => ({
                at: r.bucket instanceof Date ? r.bucket : new Date(r.bucket),
                count: Number(r.count),
            }));
        },
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
