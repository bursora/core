/**
 * Port for the `budgets` table read path. Domain stays free of Drizzle.
 *
 * The decide use case asks the repo for every budget row that could match the
 * incoming request scope set (workspace, optional tenant/agent/workflow). The
 * repository scopes by workspace and returns rows where:
 *   - scope_type = 'workspace' and scope_id IS NULL, OR
 *   - scope_type matches one of the requested scopes AND scope_id matches.
 *
 * The `period` column stores the literal `Period` strings the domain uses;
 * the repository filters out rows with anything else.
 */

import type { Budget, ScopeType } from "./budget";

/**
 * Optional narrowing for `listByWorkspace`. Selects rows where the budget's
 * `scope_type` equals `kind` and `scope_id` equals `id`. Discriminated to
 * make the mutual exclusivity a type invariant — a budget row has exactly one
 * scope, so filtering by more than one at once is meaningless.
 */
export type BudgetListFilter =
    | { readonly kind: "tenant"; readonly id: string }
    | { readonly kind: "agent"; readonly id: string }
    | { readonly kind: "workflow"; readonly id: string };

export interface BudgetScopeQuery {
    readonly workspaceId: string;
    readonly tenantId: string | null;
    readonly agentId: string | null;
    readonly workflowId: string | null;
}

export interface BudgetRepository {
    /**
     * Returns every budget row that applies to the given scope set. The repo
     * does NOT compute the period window — the application layer attaches
     * `periodFrom` per row using the period helper before passing to
     * evaluateBudget.
     */
    findApplicable(query: BudgetScopeQuery): Promise<readonly RawBudget[]>;

    /**
     * Returns every budget row owned by the given workspace, scoped by
     * `workspace_id`. Used by the dashboard list page. Optional `filter`
     * narrows to rows whose scope_type/scope_id match a specific tenant,
     * agent, or workflow.
     */
    listByWorkspace(workspaceId: string, filter?: BudgetListFilter): Promise<readonly RawBudget[]>;

    /**
     * Returns the row with `id` only when it belongs to `workspaceId`. Used by
     * the detail page; foreign-workspace ids resolve to `null` so the page 404s.
     */
    findById(id: string, workspaceId: string): Promise<RawBudget | null>;

    /**
     * Inserts a new budget row and returns the persisted shape. Caller is
     * responsible for validation; the repository trusts the input.
     */
    create(input: CreateBudgetInput): Promise<RawBudget>;

    /**
     * Updates the row with `id` only when it belongs to `workspaceId`. Returns
     * the updated row, or `null` when no row matches (foreign workspace or
     * unknown id). Patch fields that are `undefined` are left unchanged.
     */
    update(id: string, workspaceId: string, patch: UpdateBudgetInput): Promise<RawBudget | null>;

    /**
     * Deletes the row with `id` only when it belongs to `workspaceId`. Returns
     * `true` when a row was removed.
     */
    delete(id: string, workspaceId: string): Promise<boolean>;
}

/**
 * Repository-internal shape: the `Budget` columns minus the resolved
 * `periodFrom`. The application layer adds `periodFrom` after reading the
 * rows.
 */
export interface RawBudget {
    readonly id: string;
    readonly workspaceId: string;
    readonly scopeType: ScopeType;
    readonly scopeId: string | null;
    readonly period: Budget["period"];
    readonly amountUsd: string;
    readonly mode: Budget["mode"];
}

/**
 * Input shape for `create`. Mirrors `RawBudget` minus `id`.
 */
export interface CreateBudgetInput {
    readonly workspaceId: string;
    readonly scopeType: ScopeType;
    readonly scopeId: string | null;
    readonly period: Budget["period"];
    readonly amountUsd: string;
    readonly mode: Budget["mode"];
}

/**
 * Input shape for `update`. Every field is optional; only provided fields
 * are written. `scopeId` may be set to `null` to clear it (for workspace
 * scope).
 */
export interface UpdateBudgetInput {
    readonly scopeType?: ScopeType;
    readonly scopeId?: string | null;
    readonly period?: Budget["period"];
    readonly amountUsd?: string;
    readonly mode?: Budget["mode"];
}
