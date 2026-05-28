/**
 * Drizzle implementation of the UsageEventRepository.
 *
 * One batch INSERT per call. Postgres routes each row to the right partition
 * automatically based on the `ts` column. Cost is bound as a string so the
 * `numeric(14,8)` precision is preserved end-to-end.
 *
 * Idempotency: the partial unique index
 *   `(workspace_id, request_id, ts) WHERE request_id IS NOT NULL`
 * (migration 0037) plus `ON CONFLICT DO NOTHING` collapses retried deliveries
 * sharing the same `requestId` onto the row already persisted. `ts` is part of
 * the key because `usage_events` is partitioned by `ts`, so dedup is
 * per-time-partition: a retry carrying a different `ts` lands as its own row.
 * The SDK replays the original `ts`, so real retries still dedupe. Rows without
 * a `requestId` bypass the index and always insert — same as before.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { sql } from "drizzle-orm";
import type { UsageEventRow } from "./usage-event";
import type { UsageEventRepository } from "./usage-event.repository";

export class DrizzleUsageEventRepository implements UsageEventRepository {
    constructor(private readonly db: Db) {}

    async insertBatch(rows: readonly UsageEventRow[]): Promise<number> {
        if (rows.length === 0) return 0;
        const inserted = await this.db
            .insert(schema.usageEvents)
            .values(
                rows.map((row) => ({
                    workspaceId: row.workspaceId,
                    tenantId: row.tenantId,
                    agentId: row.agentId,
                    workflowId: row.workflowId,
                    provider: row.provider,
                    model: row.model,
                    promptTokens: row.promptTokens,
                    completionTokens: row.completionTokens,
                    cacheTokens: row.cacheTokens,
                    latencyMs: row.latencyMs,
                    costUsd: row.costUsd,
                    requestId: row.requestId,
                    ts: row.ts,
                })),
            )
            // Targets the partial unique index `usage_events_workspace_request_uidx`
            // from migration 0037. The arbiter columns and the `where` clause
            // match the index exactly so Postgres resolves it. `ts` is in the
            // arbiter because the partitioned table forces it into the unique
            // key, so dedup is per-time-partition (a retry with a different `ts`
            // won't dedupe).
            .onConflictDoNothing({
                target: [
                    schema.usageEvents.workspaceId,
                    schema.usageEvents.requestId,
                    schema.usageEvents.ts,
                ],
                where: sql`${schema.usageEvents.requestId} IS NOT NULL`,
            })
            // RETURNING after ON CONFLICT DO NOTHING yields only the rows that
            // actually persisted; deduped retries are absent. Counting these is
            // how the caller bills the bundle by real writes, not retries
            // (issue #1002).
            .returning({ id: schema.usageEvents.id });
        return inserted.length;
    }
}
