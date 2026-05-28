/**
 * Drizzle implementation of the UsageEventRepository.
 *
 * One batch INSERT per call. Postgres routes each row to the right partition
 * automatically based on the `ts` column. Cost is bound as a string so the
 * `numeric(14,8)` precision is preserved end-to-end.
 *
 * Idempotency: the partial unique index
 *   `(workspace_id, request_id) WHERE request_id IS NOT NULL`
 * (migration 0037) plus `ON CONFLICT DO NOTHING` collapses retried deliveries
 * sharing the same `requestId` onto the row already persisted. Rows without
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
            // from migration 0037. The `where` clause matches the index's WHERE
            // predicate so Postgres uses this index for arbiter resolution.
            .onConflictDoNothing({
                target: [schema.usageEvents.workspaceId, schema.usageEvents.requestId],
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
