/**
 * Drizzle implementation of the UsageEventRepository.
 *
 * One batch INSERT per call. Postgres routes each row to the right partition
 * automatically based on the `ts` column. Cost is bound as a string so the
 * `numeric(14,8)` precision is preserved end-to-end.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import type { UsageEventRow } from "./usage-event";
import type { UsageEventRepository } from "./usage-event.repository";

export class DrizzleUsageEventRepository implements UsageEventRepository {
    constructor(private readonly db: Db) {}

    async insertBatch(rows: readonly UsageEventRow[]): Promise<void> {
        if (rows.length === 0) return;
        await this.db.insert(schema.usageEvents).values(
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
        );
    }
}
