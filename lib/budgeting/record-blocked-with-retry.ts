// If the deciding budget is deleted between decide and write, the FK on
// `decided_by_budget_id` fails. Retry once with the FK column nulled so the
// row still lands (workspace-wide counts stay correct, per-budget attribution
// is dropped). Caller logs the rethrow.
//
// Retry only triggers on Postgres FK violation (SQLSTATE 23503). Other errors
// (timeout, syntax, connection loss) rethrow so callers don't double-insert
// after a phantom commit and so transient infra issues stay observable.

const FK_VIOLATION_CODE = "23503";

export interface BlockedRowPayload {
    readonly workspaceId: string;
    readonly tenantId: string | null;
    readonly agentId: string | null;
    readonly workflowId: string | null;
    readonly ts: Date;
    readonly decidedByBudgetId: string | null;
    /** SDK-declared target of the blocked call. NULL for SDKs that don't send it. */
    readonly intendedProvider: string | null;
    readonly intendedModel: string | null;
    /** Decision reason string from `evaluateBudget`. */
    readonly blockReason: string | null;
}

export type BlockedInsert = (payload: BlockedRowPayload) => Promise<void>;

export async function recordBlockedWithRetry(
    insert: BlockedInsert,
    payload: BlockedRowPayload,
): Promise<void> {
    try {
        await insert(payload);
        return;
    } catch (err) {
        if (!isFkViolation(err)) throw err;
    }
    await insert({ ...payload, decidedByBudgetId: null });
}

function isFkViolation(err: unknown): boolean {
    if (typeof err !== "object" || err === null) return false;
    return (err as { code?: unknown }).code === FK_VIOLATION_CODE;
}
