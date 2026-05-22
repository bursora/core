/**
 * Pure UI helpers for the /alerts dashboard.
 *
 * - flattenScope: collapses (workspaceId, tenantId, agentId) into a single
 *   {type, id} pair, agent winning over tenant.
 * - scopeLabel: human tag like `tenant:acme` or bare `workspace`.
 * - buildSpendLink: deep-link to /spend pre-filtered to the alert's scope.
 *   Workspace scope maps to facet=tenant since /spend has no workspace facet.
 * - anomalyAlertId: deterministic id minted from an anomaly's natural key
 *   (workspace + scope + raisedAt). Shared between the drizzle alert repo
 *   (insert path) and the dashboard banner (anchor link) so the two strings
 *   stay byte-identical.
 */

import type { Route } from "next";
import { buildWorkspacePath } from "../routes";
import { deterministicUuid } from "../uuid";
import type { AnomalyAlert } from "./alert";

export interface AlertScope {
    readonly workspaceId: string;
    readonly tenantId: string | null;
    readonly agentId: string | null;
}

export interface FlatScope {
    readonly type: "workspace" | "tenant" | "agent";
    readonly id: string | null;
}

export function flattenScope(alert: { scope: AlertScope }): FlatScope {
    if (alert.scope.agentId !== null) return { type: "agent", id: alert.scope.agentId };
    if (alert.scope.tenantId !== null) return { type: "tenant", id: alert.scope.tenantId };
    return { type: "workspace", id: null };
}

export function scopeLabel(s: FlatScope): string {
    return s.id === null ? s.type : `${s.type}:${s.id}`;
}

export function buildSpendLink(workspaceId: string, s: FlatScope, from: Date, to: Date): Route {
    const query: Record<string, string> = {
        facet: s.type === "workspace" ? "tenant" : s.type,
        from: from.toISOString(),
        to: to.toISOString(),
    };
    if (s.id !== null) query.scope_id = s.id;
    return buildWorkspacePath(workspaceId, "spend", query);
}

/**
 * Stable id for an anomaly alert. The drizzle repo uses this on the write
 * path to mint a deterministic primary key; the dashboard banner uses it to
 * build `#alert-<id>` anchors that line up with the persisted row.
 */
export function anomalyAlertId(alert: AnomalyAlert): string {
    const { type, id } = flattenScope(alert);
    return deterministicUuid(
        `alert|${alert.kind}|${alert.scope.workspaceId}|${type}|${id ?? ""}|${alert.raisedAt.toISOString()}`,
    );
}
