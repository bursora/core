/**
 * Alert repository port.
 *
 * Two write paths:
 *   - `insertBatch`: anomaly alerts. Idempotent per
 *     `(workspace_id, kind, scope_type, scope_id, raised_at)`. On conflict the
 *     existing row is updated in place when the incoming `deviation` is
 *     strictly greater than the stored one (a higher peak inside the same
 *     5-min bucket); equal or lower deviations are no-ops. Only newly
 *     inserted rows are returned, so the caller publishes `alert.raised`
 *     exactly once per bucket per scope.
 *   - `recordBudgetCrossing`: budget alerts. Idempotent per
 *     `(workspace_id, budget_id, period_from)` so the budget-exceeded
 *     notification fires exactly once per window crossing. Returns
 *     `{ inserted: false, id: null }` when the row already exists, else
 *     `{ inserted: true, id }` carrying the row's id.
 *
 * `listForWorkspace` is the read-side feed for the dashboard. It returns
 * both anomaly and budget rows as a discriminated `Alert` union; callers
 * branch on `kind`.
 */

import type { Period } from "../budgeting/period";
import type { AlertKind, AlertSeverity } from "../severity";
import type { Alert, AnomalyAlert } from "./alert";

export type AlertScopeType = "workspace" | "tenant" | "agent" | "budget";

export interface ListAlertsQuery {
    readonly workspaceId: string;
    readonly kind?: AlertKind;
    readonly tenantId?: readonly string[];
    readonly agentId?: readonly string[];
    readonly since: Date;
    readonly until?: Date;
    readonly limit: number;
}

export interface BudgetCrossingPayload {
    /** Short decision string, e.g. `tenant:acme:over:75.00/50.00`. */
    readonly reason: string;
    readonly scopeType: "workspace" | "tenant" | "agent" | "workflow";
    readonly scopeId: string | null;
    readonly period: Period;
    readonly mode: "block" | "throttle" | "notify";
    readonly used: number;
    readonly limit: number;
}

export interface BudgetCrossingRecord {
    readonly workspaceId: string;
    readonly budgetId: string;
    readonly periodFrom: Date;
    readonly pctOver: number;
    readonly severity: AlertSeverity;
    /**
     * Structured trip payload. The repo JSON-encodes it into the `reason`
     * column so the alert row keeps the full attribution context for the
     * dashboard.
     */
    readonly payload: BudgetCrossingPayload;
    readonly raisedAt: Date;
}

export interface RecordBudgetCrossingResult {
    readonly inserted: boolean;
    readonly id: string | null;
}

export interface InsertedAlert {
    readonly alert: AnomalyAlert;
    readonly id: string;
}

export interface AlertRepository {
    insertBatch(alerts: readonly AnomalyAlert[]): Promise<readonly InsertedAlert[]>;
    recordBudgetCrossing(crossing: BudgetCrossingRecord): Promise<RecordBudgetCrossingResult>;
    listForWorkspace(query: ListAlertsQuery): Promise<readonly Alert[]>;
}
