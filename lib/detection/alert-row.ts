/**
 * Pure mapper from the flat `alerts` row shape to the discriminated `Alert`
 * union. Lives outside the drizzle repo so it can be unit-tested without a DB.
 *
 * Two row shapes:
 *   - anomaly: scope_type ∈ {workspace, tenant, agent}, plaintext reason,
 *     window_cost_usd may be set.
 *   - budget:  scope_type = 'budget', reason is a JSON BudgetCrossingPayload,
 *     period_from is set, scope_id holds the budget id, window_cost_usd null.
 *
 * Returns null when a budget row has a malformed JSON payload (legacy rows or
 * a partial write). The caller filters nulls so one bad row never breaks the
 * whole /alerts feed.
 */

import type { BudgetAlertRaisedEvent } from "../event-bus";
import type { AlertSeverity } from "../severity";
import type { Alert, BudgetAlert } from "./alert";
import type { AlertScopeType, BudgetCrossingPayload } from "./alert.repository";
import { DEFAULT_BUCKET_MINUTES } from "./bucket";

export interface AlertRow {
    readonly workspaceId: string;
    readonly kind: string;
    readonly scopeType: string;
    readonly scopeId: string | null;
    readonly reason: string;
    readonly deviation: string;
    readonly severity: string;
    readonly periodFrom: Date | null;
    readonly raisedAt: Date;
    readonly windowCostUsd: string | null;
}

const isAlertScopeType = (s: string): s is AlertScopeType =>
    s === "workspace" || s === "tenant" || s === "agent" || s === "budget";

const isSeverity = (s: string): s is AlertSeverity => s === "warning" || s === "critical";

const isAlertKind = (s: string): s is "anomaly" | "budget" => s === "anomaly" || s === "budget";

export const rowToAlert = (row: AlertRow): Alert | null => {
    if (!isAlertKind(row.kind)) {
        throw new Error(`unexpected alert kind: ${row.kind}`);
    }
    if (!isSeverity(row.severity)) {
        throw new Error(`unexpected alert severity: ${row.severity}`);
    }
    if (!isAlertScopeType(row.scopeType)) {
        throw new Error(`unexpected alert scope_type: ${row.scopeType}`);
    }

    if (row.kind === "budget") {
        if (row.scopeId === null) {
            throw new Error("budget alert row missing scope_id (budget id)");
        }
        if (row.periodFrom === null) {
            throw new Error("budget alert row missing period_from");
        }
        const payload = parseBudgetPayload(row);
        if (payload === null) return null;
        return {
            kind: "budget",
            workspaceId: row.workspaceId,
            budgetId: row.scopeId,
            severity: row.severity,
            raisedAt: row.raisedAt,
            periodFrom: row.periodFrom,
            pctOver: Number(row.deviation),
            payload,
        };
    }

    const tenantId = row.scopeType === "tenant" ? row.scopeId : null;
    const agentId = row.scopeType === "agent" ? row.scopeId : null;
    const windowEnd = new Date(row.raisedAt.getTime() + DEFAULT_BUCKET_MINUTES * 60_000);

    return {
        kind: "anomaly",
        scope: {
            workspaceId: row.workspaceId,
            tenantId,
            agentId,
        },
        reason: row.reason,
        deviation: Number(row.deviation),
        severity: row.severity,
        raisedAt: row.raisedAt,
        windowStart: row.raisedAt,
        windowEnd,
        windowCostUsd: row.windowCostUsd === null ? null : Number(row.windowCostUsd),
    };
};

function parseBudgetPayload(row: AlertRow): BudgetCrossingPayload | null {
    try {
        return JSON.parse(row.reason) as BudgetCrossingPayload;
    } catch (error) {
        console.warn("alert_row.budget_payload_invalid", {
            workspaceId: row.workspaceId,
            scopeId: row.scopeId,
            raisedAt: row.raisedAt.toISOString(),
            error: error instanceof Error ? error.message : String(error),
        });
        return null;
    }
}

/**
 * Projects a stored `BudgetAlert` back into the `BudgetAlertRaisedEvent` shape
 * the attribution formatter, webhook renderer, and email renderer share.
 *
 * The stored alert row carries a UUID, but the dashboard query path drops it
 * before mapping to `BudgetAlert`; `alertId` here ties to `budgetId` so the
 * event is internally consistent. Don't reuse this event for dedup against
 * the event-bus stream - it's a read-side projection, not a fresh emit.
 */
export function budgetAlertToEvent(alert: BudgetAlert): BudgetAlertRaisedEvent {
    const { payload } = alert;
    return {
        kind: "budget",
        alertId: alert.budgetId,
        workspaceId: alert.workspaceId,
        budgetId: alert.budgetId,
        scopeType: payload.scopeType,
        scopeId: payload.scopeId,
        period: payload.period,
        periodFrom: alert.periodFrom,
        mode: payload.mode,
        used: payload.used,
        limit: payload.limit,
        pctOver: alert.pctOver,
        severity: alert.severity,
        raisedAt: alert.raisedAt,
    };
}
