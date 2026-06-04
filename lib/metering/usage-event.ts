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
    /**
     * Subset of `cacheTokens` that are cache writes (Anthropic
     * `cache_creation_input_tokens`). Writes bill above base input, reads below
     * it, so the cost calc prices the two apart. Absent on older SDKs → 0, which
     * reproduces the prior all-at-read-rate behavior.
     */
    readonly cacheWriteTokens?: number;
    /**
     * Subset of `cacheWriteTokens` written with a 1-hour TTL (Anthropic
     * `cache_creation.ephemeral_1h_input_tokens`). These bill at 2x base input
     * versus 1.25x for 5-minute writes, so the cost calc prices them apart.
     * Absent on older SDKs → 0, which prices every write at 1.25x.
     */
    readonly cacheWrite1hTokens?: number;
    readonly ts: Date;
    readonly tenantId: string | null;
    readonly agentId: string | null;
    readonly workflowId: string | null;
    readonly latencyMs: number | null;
    readonly requestId: string | null;
    /**
     * True when the wrapped provider call threw/aborted. Errored calls carry no
     * tokens and no cost; they persist as `status='errored'` so they stay out
     * of spend and successful-call counts while remaining visible as failures.
     */
    readonly errored?: boolean;
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
     * denials stamp `'blocked'` rows; failed provider calls stamp `'errored'`.
     * On a denial, `provider`/`model` hold the SDK's intended target (or NULL
     * for older SDKs); both `'blocked'` and `'errored'` keep `costUsd` at 0.
     */
    readonly status?: "ok" | "blocked" | "errored";
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

/** A budget denial to stamp as a `status='blocked'` usage event. */
export interface BlockedUsageEvent {
    readonly workspaceId: string;
    readonly tenantId: string | null;
    readonly agentId: string | null;
    readonly workflowId: string | null;
    readonly ts: Date;
    /** Id of the budget whose cap tripped this call. */
    readonly budgetId: string;
    /** SDK-declared target of the blocked call. NULL when the SDK omitted them. */
    readonly intendedProvider: string | null;
    readonly intendedModel: string | null;
    /** Decision reason string from `evaluateBudget`. */
    readonly blockReason: string;
}

/**
 * Builds the persisted row for a budget denial: zeroed tokens/latency/cost,
 * `provider`/`model` carrying the SDK's intended target (empty string when the
 * SDK omitted them, matching the non-Nullable ClickHouse facet columns).
 */
export function blockedUsageEventRow(event: BlockedUsageEvent): UsageEventRow {
    return {
        workspaceId: event.workspaceId,
        tenantId: event.tenantId,
        agentId: event.agentId,
        workflowId: event.workflowId,
        provider: event.intendedProvider ?? "",
        model: event.intendedModel ?? "",
        promptTokens: 0,
        completionTokens: 0,
        cacheTokens: 0,
        latencyMs: null,
        costUsd: "0",
        requestId: null,
        ts: event.ts,
        status: "blocked",
        decidedByBudgetId: event.budgetId,
        blockReason: event.blockReason,
    };
}

/**
 * Builds the persisted row for a failed provider call: zeroed cost (failures
 * carry no tokens), `status='errored'`. Tags, ts, latency, and requestId are
 * kept so the failure stays attributable; pricing is skipped entirely since the
 * cost is definitionally 0.
 */
export function erroredUsageEventRow(workspaceId: string, event: UsageEventInput): UsageEventRow {
    return {
        workspaceId,
        tenantId: event.tenantId,
        agentId: event.agentId,
        workflowId: event.workflowId,
        provider: event.provider,
        model: event.model,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
        cacheTokens: event.cacheTokens,
        latencyMs: event.latencyMs,
        costUsd: "0",
        requestId: event.requestId,
        ts: event.ts,
        status: "errored",
    };
}
