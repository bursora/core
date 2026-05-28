/**
 * Drizzle implementation of the AlertRepository.
 *
 * Write path: one INSERT per call. Maps the domain Alert (with structured
 * scope) onto the flattened `alerts` columns. Scope flattening:
 *   - tenantId set, agentId null  → scope_type=tenant,    scope_id=tenantId
 *   - agentId set                 → scope_type=agent,     scope_id=agentId
 *   - both null                   → scope_type=workspace, scope_id=null
 *
 * Read path (`listForWorkspace`): selects rows for one workspace newest
 * first, with optional narrowing by scope_type / scope_id and a `since`
 * cutoff. Workspace isolation is enforced by the `workspace_id = $1`
 * predicate; the caller MUST pass the verified workspace id from the
 * session.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { alerts as alertsTable } from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Alert, AnomalyAlert } from "./alert";
import { rowToAlert } from "./alert-row";
import type {
    AlertRepository,
    BudgetCrossingRecord,
    InsertedAlert,
    ListAlertsQuery,
    RecordBudgetCrossingResult,
} from "./alert.repository";
import { anomalyAlertId, flattenScope } from "./alerts-ui";

export const drizzleAlertRepository = (db: Db): AlertRepository => ({
    insertBatch: async (alerts: readonly AnomalyAlert[]): Promise<readonly InsertedAlert[]> => {
        if (alerts.length === 0) return [];
        const valuesWithIds = alerts.map((alert) => {
            const { type: scopeType, id: scopeId } = flattenScope(alert);
            const id = anomalyAlertId(alert);
            return {
                alert,
                id,
                row: {
                    id,
                    workspaceId: alert.scope.workspaceId,
                    kind: alert.kind,
                    scopeType,
                    scopeId,
                    reason: alert.reason,
                    deviation: alert.deviation.toString(),
                    severity: alert.severity,
                    raisedAt: alert.raisedAt,
                    windowCostUsd:
                        alert.windowCostUsd === null ? null : alert.windowCostUsd.toString(),
                },
            };
        });
        const insertedRows = await db
            .insert(alertsTable)
            .values(valuesWithIds.map((v) => v.row))
            // Deterministic id is the dedup key. On conflict, escalate the row
            // when the incoming deviation is strictly greater — that's a
            // higher peak inside the same 5-min bucket. `xmax = 0` in RETURNING
            // distinguishes a fresh insert from an update so fan-out only
            // fires for new alerts.
            .onConflictDoUpdate({
                target: alertsTable.id,
                set: {
                    deviation: sql`excluded.deviation`,
                    severity: sql`excluded.severity`,
                    reason: sql`excluded.reason`,
                    windowCostUsd: sql`excluded.window_cost_usd`,
                },
                setWhere: sql`excluded.deviation > ${alertsTable.deviation}`,
            })
            .returning({ id: alertsTable.id, isNew: sql<boolean>`xmax = 0` });
        const insertedIds = new Set(insertedRows.filter((r) => r.isNew).map((r) => r.id));
        return valuesWithIds
            .filter((v) => insertedIds.has(v.id))
            .map(({ alert, id }) => ({ alert, id }));
    },

    recordBudgetCrossing: async (
        crossing: BudgetCrossingRecord,
    ): Promise<RecordBudgetCrossingResult> => {
        const inserted = await db
            .insert(alertsTable)
            .values({
                workspaceId: crossing.workspaceId,
                kind: "budget",
                scopeType: "budget",
                scopeId: crossing.budgetId,
                // The reason column carries the structured trip payload so the
                // dashboard can render scope/spend/cap/top-offender. Anomaly
                // rows still hold a plaintext reason; readers branch on `kind`.
                reason: JSON.stringify(crossing.payload),
                deviation: crossing.pctOver.toString(),
                severity: crossing.severity,
                periodFrom: crossing.periodFrom,
                raisedAt: crossing.raisedAt,
            })
            // Inference predicate must match migration 0012's partial unique
            // index (WHERE kind = 'budget') for the conflict target to resolve.
            .onConflictDoNothing({
                target: [alertsTable.workspaceId, alertsTable.scopeId, alertsTable.periodFrom],
                where: sql`${alertsTable.kind} = 'budget'`,
            })
            .returning({ id: alertsTable.id });

        const row = inserted[0];
        return row ? { inserted: true, id: row.id } : { inserted: false, id: null };
    },

    listForWorkspace: async (query: ListAlertsQuery): Promise<readonly Alert[]> => {
        const conditions = [
            eq(alertsTable.workspaceId, query.workspaceId),
            gte(alertsTable.raisedAt, query.since),
        ];
        if (query.kind !== undefined) {
            conditions.push(eq(alertsTable.kind, query.kind));
        }
        if (query.until !== undefined) {
            conditions.push(lt(alertsTable.raisedAt, query.until));
        }
        if (query.tenantId !== undefined && query.tenantId.length > 0) {
            conditions.push(eq(alertsTable.scopeType, "tenant"));
            conditions.push(inArray(alertsTable.scopeId, query.tenantId as string[]));
        }
        if (query.agentId !== undefined && query.agentId.length > 0) {
            conditions.push(eq(alertsTable.scopeType, "agent"));
            conditions.push(inArray(alertsTable.scopeId, query.agentId as string[]));
        }

        const rows = await db
            .select({
                workspaceId: alertsTable.workspaceId,
                kind: alertsTable.kind,
                scopeType: alertsTable.scopeType,
                scopeId: alertsTable.scopeId,
                reason: alertsTable.reason,
                deviation: alertsTable.deviation,
                severity: alertsTable.severity,
                periodFrom: alertsTable.periodFrom,
                raisedAt: alertsTable.raisedAt,
                windowCostUsd: alertsTable.windowCostUsd,
            })
            .from(alertsTable)
            .where(and(...conditions))
            .orderBy(desc(alertsTable.raisedAt))
            .limit(query.limit);

        return rows.map(rowToAlert).filter((a): a is NonNullable<typeof a> => a !== null);
    },
});
