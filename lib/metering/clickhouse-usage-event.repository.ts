/**
 * ClickHouse implementation of the UsageEventRepository.
 *
 * One synchronous insert per call into the `usage_events` MergeTree (DDL:
 * `clickhouse/migrations/0001_usage_events.sql`). The call resolves only after
 * ClickHouse has acknowledged the write, so a recorded event is visible to the
 * very next budget preflight SUM — enforcement reads exact, never stale-low.
 *
 * No `ON CONFLICT` exists here — idempotency is enforced upstream by the Redis
 * dedup guard in `ingest-events.usecase.ts`, which drops retried `request_id`s
 * before they reach this sink. So `insertBatch` writes every row it is given
 * and reports that count.
 */

import "server-only";

import type { ClickHouse } from "@/lib/clickhouse/client";
import { randomUUID } from "node:crypto";
import type { UsageEventRow } from "./usage-event";
import type { UsageEventRepository } from "./usage-event.repository";

const TABLE = "usage_events";

/**
 * Wire shape matching the DDL column names/types. Absent facet tags become the
 * empty string (the table keeps them non-Nullable); `cost_usd` stays a string
 * so the `Decimal(22,8)` precision survives the JSONEachRow round trip.
 */
interface ClickHouseUsageEventRow {
    id: string;
    workspace_id: string;
    tenant_id: string;
    agent_id: string;
    workflow_id: string;
    provider: string;
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    cache_tokens: number;
    latency_ms: number | null;
    cost_usd: string;
    request_id: string | null;
    status: "ok" | "blocked" | "errored";
    decided_by_budget_id: string | null;
    block_reason: string | null;
    ts: string;
}

export class ClickHouseUsageEventRepository implements UsageEventRepository {
    constructor(private readonly ch: ClickHouse) {}

    async insertBatch(rows: readonly UsageEventRow[]): Promise<number> {
        if (rows.length === 0) return 0;
        await this.ch.insert<ClickHouseUsageEventRow>({
            table: TABLE,
            values: rows.map(toClickHouseRow),
        });
        return rows.length;
    }

    async eraseByWorkspaces(workspaceIds: readonly string[]): Promise<void> {
        if (workspaceIds.length === 0) return;
        await this.ch.query({
            query: `ALTER TABLE ${TABLE} DELETE WHERE workspace_id IN ({ids:Array(UUID)})`,
            query_params: { ids: [...workspaceIds] },
        });
    }
}

function toClickHouseRow(row: UsageEventRow): ClickHouseUsageEventRow {
    return {
        id: randomUUID(),
        workspace_id: row.workspaceId,
        tenant_id: row.tenantId ?? "",
        agent_id: row.agentId ?? "",
        workflow_id: row.workflowId ?? "",
        provider: row.provider,
        model: row.model,
        prompt_tokens: row.promptTokens,
        completion_tokens: row.completionTokens,
        cache_tokens: row.cacheTokens,
        latency_ms: row.latencyMs,
        cost_usd: row.costUsd,
        request_id: row.requestId,
        status: row.status ?? "ok",
        decided_by_budget_id: row.decidedByBudgetId ?? null,
        block_reason: row.blockReason ?? null,
        ts: toClickHouseDateTime64(row.ts),
    };
}

/**
 * `DateTime64(3)` over JSONEachRow with the default `basic` input format wants
 * `'YYYY-MM-DD HH:MM:SS.mmm'` in UTC, not ISO 8601 with `T`/`Z`.
 */
function toClickHouseDateTime64(d: Date): string {
    return d.toISOString().replace("T", " ").replace("Z", "");
}
