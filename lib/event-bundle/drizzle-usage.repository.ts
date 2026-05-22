/**
 * Drizzle-backed `EventBundleUsageRepository`. Wraps the
 * `workspace_event_bundle_usage` rollup. Used as both the cold store for
 * the Redis counter and the canonical billing source for overage.
 */

import "server-only";

import { schema, type Db } from "@/lib/db";
import { and, eq, sql } from "drizzle-orm";
import type { EventBundleMonthRollup, EventBundleUsageRepository } from "./types";

export function drizzleEventBundleUsageRepository(db: Db): EventBundleUsageRepository {
    return {
        async findMonth(input) {
            const rows = await db
                .select({
                    eventsCount: schema.workspaceEventBundleUsage.eventsCount,
                    overageCents: schema.workspaceEventBundleUsage.overageCents,
                })
                .from(schema.workspaceEventBundleUsage)
                .where(
                    and(
                        eq(schema.workspaceEventBundleUsage.workspaceId, input.workspaceId),
                        eq(schema.workspaceEventBundleUsage.month, input.month),
                    ),
                )
                .limit(1);
            const row = rows[0];
            if (!row) return null;
            const rollup: EventBundleMonthRollup = {
                eventsCount: row.eventsCount,
                overageCents: row.overageCents,
            };
            return rollup;
        },
        async upsertMonth(input) {
            // Guard against stale later-arriving writes overwriting a fresher
            // larger total. Two ingest workers can reach `upsertMonth` out of
            // order — the larger absolute count is always the right one.
            await db
                .insert(schema.workspaceEventBundleUsage)
                .values({
                    workspaceId: input.workspaceId,
                    month: input.month,
                    eventsCount: input.eventsCount,
                    overageCents: input.overageCents,
                })
                .onConflictDoUpdate({
                    target: [
                        schema.workspaceEventBundleUsage.workspaceId,
                        schema.workspaceEventBundleUsage.month,
                    ],
                    set: {
                        eventsCount: input.eventsCount,
                        overageCents: input.overageCents,
                        updatedAt: new Date(),
                    },
                    setWhere: sql`excluded.events_count >= ${schema.workspaceEventBundleUsage.eventsCount}`,
                });
        },
    };
}
