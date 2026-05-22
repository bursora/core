/**
 * Usage event aggregate.
 *
 * LLM usage lives in `usage_events` (partitioned by month). The shape
 * mirrors the schema columns; cost_usd is a decimal string with 8 fractional
 * digits to match `numeric(14,8)`.
 *
 * Two interfaces:
 *   - UsageEventInput: what the caller (the SDK / API) supplies. workspaceId
 *     is intentionally absent — the server derives it from the api key.
 *   - UsageEventRow: the persisted shape, including server-derived fields
 *     (workspaceId, costUsd, id).
 */

export interface UsageEventInput {
    readonly provider: string;
    readonly model: string;
    readonly region: string;
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly cacheTokens: number;
    readonly ts: Date;
    readonly tenantId: string | null;
    readonly agentId: string | null;
    readonly workflowId: string | null;
    readonly latencyMs: number | null;
    readonly requestId: string | null;
}

export interface UsageEventRow {
    readonly workspaceId: string;
    readonly tenantId: string | null;
    readonly agentId: string | null;
    readonly workflowId: string | null;
    readonly provider: string;
    readonly model: string;
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly cacheTokens: number;
    readonly latencyMs: number | null;
    readonly costUsd: string;
    readonly requestId: string | null;
    readonly ts: Date;
    /**
     * Persisted call status. Defaults to `'ok'` for successful calls; budget
     * denials stamp `'blocked'` rows. On a denial, `provider`/`model` hold
     * the SDK's intended target (or NULL for older SDKs); `costUsd` stays 0.
     */
    readonly status?: "ok" | "blocked";
    /**
     * For `status='blocked'` rows, the id of the budget whose cap tripped this
     * call. NULL for `status='ok'` rows and for blocked rows persisted before
     * this column existed.
     */
    readonly decidedByBudgetId?: string | null;
    /**
     * Protocol reason string from `evaluateBudget` (e.g. `workspace:*:over:1.8/2`).
     * Set only on `'blocked'` rows.
     */
    readonly blockReason?: string | null;
}
