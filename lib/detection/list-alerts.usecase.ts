/**
 * listAlerts — read-side feed for the /alerts dashboard.
 *
 * Returns the workspace's anomaly alerts whose `raised_at` falls within the
 * supplied window (`from` inclusive, `to` exclusive), newest first. Optional
 * `tenantId` / `agentId` filters narrow the feed by tag.
 *
 * Workspace isolation is enforced by the caller (use the verified workspace
 * id from the session) AND by the repository's `workspace_id = $1` predicate.
 *
 * Default limit is 100. Callers may pass a smaller cap; larger caps are
 * permitted but the dashboard never asks for more.
 */

import type { AlertKind } from "../severity";
import type { Alert, AnomalyAlert, BudgetAlert } from "./alert";
import type { AlertRepository } from "./alert.repository";

export interface ListAlertsInput {
    readonly workspaceId: string;
    readonly kind?: AlertKind;
    readonly tenantId?: readonly string[] | undefined;
    readonly agentId?: readonly string[] | undefined;
    readonly from: Date;
    readonly to?: Date;
    readonly limit?: number;
    readonly alerts: AlertRepository;
}

export const DEFAULT_LIST_ALERTS_LIMIT = 100;

/**
 * Returns alerts from the repo, narrowed by `kind` when supplied. The repo
 * already filters server-side, so the return type can be tightened: passing
 * `kind: "anomaly"` yields `readonly AnomalyAlert[]`, `kind: "budget"` yields
 * `readonly BudgetAlert[]`, and omitting `kind` yields the full union. This
 * removes the need for callers to re-filter at the type boundary.
 */
export function listAlertsUseCase(
    input: ListAlertsInput & { readonly kind: "anomaly" },
): Promise<readonly AnomalyAlert[]>;
export function listAlertsUseCase(
    input: ListAlertsInput & { readonly kind: "budget" },
): Promise<readonly BudgetAlert[]>;
export function listAlertsUseCase(input: ListAlertsInput): Promise<readonly Alert[]>;
export async function listAlertsUseCase(input: ListAlertsInput): Promise<readonly Alert[]> {
    const tenantId = input.tenantId && input.tenantId.length > 0 ? input.tenantId : undefined;
    const agentId = input.agentId && input.agentId.length > 0 ? input.agentId : undefined;

    return input.alerts.listForWorkspace({
        workspaceId: input.workspaceId,
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(tenantId !== undefined ? { tenantId } : {}),
        ...(agentId !== undefined ? { agentId } : {}),
        since: input.from,
        ...(input.to !== undefined ? { until: input.to } : {}),
        limit: input.limit ?? DEFAULT_LIST_ALERTS_LIMIT,
    });
}
