/**
 * Shared `usage_events` row factory for ClickHouse contract tests. Mirrors the
 * non-Nullable facet defaults of the CH table (absent tags are the empty
 * string) so each suite inserts realistic rows with a single override object.
 */

import type { ClickHouse } from "@/lib/clickhouse/client";
import { randomUUID } from "node:crypto";

export const CONTRACT_WORKSPACE = "11111111-2222-3333-4444-555555555555";

export interface UsageEventOverrides {
    workspaceId?: string;
    tenantId?: string;
    agentId?: string;
    workflowId?: string;
    provider?: string;
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    cacheTokens?: number;
    costUsd?: string;
    status?: "ok" | "blocked";
    ts?: Date;
}

/** CH `DateTime64(3)` literal: `YYYY-MM-DD HH:MM:SS.sss` with no zone suffix. */
export const toChDateTime = (d: Date): string => d.toISOString().replace("T", " ").replace("Z", "");

export async function insertUsageEvent(
    ch: ClickHouse,
    overrides: UsageEventOverrides = {},
): Promise<void> {
    await ch.insert({
        table: "usage_events",
        values: [
            {
                id: randomUUID(),
                workspace_id: overrides.workspaceId ?? CONTRACT_WORKSPACE,
                tenant_id: overrides.tenantId ?? "",
                agent_id: overrides.agentId ?? "",
                workflow_id: overrides.workflowId ?? "",
                provider: overrides.provider ?? "openai",
                model: overrides.model ?? "gpt-4o",
                prompt_tokens: overrides.promptTokens ?? 0,
                completion_tokens: overrides.completionTokens ?? 0,
                cache_tokens: overrides.cacheTokens ?? 0,
                cost_usd: overrides.costUsd ?? "0.00000000",
                status: overrides.status ?? "ok",
                ts: toChDateTime(overrides.ts ?? new Date("2026-06-10T12:00:00Z")),
            },
        ],
    });
}
