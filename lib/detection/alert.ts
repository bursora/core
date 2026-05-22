/**
 * Alert is a discriminated union over `kind`. Two variants land in the same
 * `alerts` table: anomaly rows from the detection cron, and budget rows from
 * the budget-decision path. Dashboard consumers branch on `kind`.
 *
 * `windowCostUsd` on anomaly rows is null only on the read path - legacy rows
 * persisted before the column existed have no value. Freshly detected alerts
 * always carry a number.
 */

import type { AlertSeverity } from "../severity";
import type { BudgetCrossingPayload } from "./alert.repository";

export interface AlertScope {
    readonly workspaceId: string;
    readonly tenantId: string | null;
    readonly agentId: string | null;
}

export interface AnomalyAlert {
    readonly kind: "anomaly";
    readonly scope: AlertScope;
    readonly reason: string;
    readonly deviation: number;
    readonly severity: AlertSeverity;
    readonly raisedAt: Date;
    readonly windowStart: Date;
    readonly windowEnd: Date;
    readonly windowCostUsd: number | null;
}

export interface BudgetAlert {
    readonly kind: "budget";
    readonly workspaceId: string;
    readonly budgetId: string;
    readonly severity: AlertSeverity;
    readonly raisedAt: Date;
    readonly periodFrom: Date;
    readonly pctOver: number;
    readonly payload: BudgetCrossingPayload;
}

export type Alert = AnomalyAlert | BudgetAlert;
