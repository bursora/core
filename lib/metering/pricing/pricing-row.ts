/**
 * Pricing row entity + repository interface.
 *
 * A pricing row represents the cost of input/output/cache tokens for a given
 * (provider, model, region) at a specific point in time. Rows are versioned:
 * when a rate changes, the previous row's `effectiveTo` is set and a new row
 * is inserted with `effectiveFrom = now()`.
 *
 * `workspaceId` distinguishes:
 *   - `null` → global rows scraped by the daily cron
 *   - `<uuid>` → workspace-scoped overrides set in settings
 *
 * Numerics are stored as decimal strings to preserve precision. Drizzle returns
 * `numeric` columns as strings; we keep the same shape in the domain model.
 */

export interface PricingRow {
    id: string;
    workspaceId: string | null;
    provider: string;
    model: string;
    region: string;
    inputPer1mUsd: string;
    outputPer1mUsd: string;
    cachePer1mUsd: string | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
}

/**
 * Shape used when inserting a new row. Mirrors the columns the use case
 * controls — `id`, `workspaceId`, and `createdAt` are owned by the repo
 * (defaults / global-only writes), `effectiveTo` is always null on insert.
 */
export interface NewPricingRow {
    provider: string;
    model: string;
    region: string;
    inputPer1mUsd: string;
    outputPer1mUsd: string;
    cachePer1mUsd: string | null;
    effectiveFrom: Date;
}

export interface PricingRepository {
    /**
     * Returns the currently active global row for (provider, model, region) —
     * `workspaceId IS NULL` and `effectiveTo IS NULL`. Returns `null` if none.
     *
     * Workspace-scoped override rows are intentionally excluded.
     */
    findLatestGlobal(provider: string, model: string, region: string): Promise<PricingRow | null>;

    /**
     * Atomically closes the previous row by setting `effectiveTo` and inserts a
     * new global row (workspaceId = null, effectiveTo = null) in a single
     * transaction.
     */
    closeAndInsert(toCloseId: string, effectiveTo: Date, toInsert: NewPricingRow): Promise<void>;

    /**
     * Inserts a new global row when no prior row exists.
     */
    insert(toInsert: NewPricingRow): Promise<void>;

    /**
     * Returns every row for (provider, model, region) that could be effective
     * at some point in time — i.e., candidates the cost-calc path can pick from.
     *
     * Includes both global rows (workspaceId IS NULL) and the override rows for
     * the given `workspaceId`. Other workspaces' overrides are excluded by the
     * repository so the caller never has to filter them. The pure
     * `findPricingRow` helper picks the right row from this candidate set.
     */
    findCandidatesForLookup(input: {
        provider: string;
        model: string;
        region: string;
        workspaceId: string;
    }): Promise<readonly PricingRow[]>;

    /**
     * Returns every row a workspace's settings panel could need to resolve its
     * full effective-pricing list: all global rows (workspaceId IS NULL) and
     * the workspace's own override rows. Other workspaces' overrides are
     * excluded by the repository.
     *
     * Unlike `findCandidatesForLookup`, this method does NOT filter by
     * (provider, model, region) — the caller groups and resolves per tuple.
     */
    findAllCandidatesForWorkspace(workspaceId: string): Promise<readonly PricingRow[]>;

    /**
     * Insert a workspace-scoped override row. Mirrors `insert` but writes
     * `workspaceId` and may carry an `effectiveTo` upper bound. The exclusion
     * constraint prevents overlapping ranges per (provider, model, region,
     * workspace).
     */
    insertOverride(input: {
        workspaceId: string;
        row: NewPricingRow;
        effectiveTo: Date | null;
    }): Promise<PricingRow>;

    /**
     * List override rows for a workspace. Global rows (workspaceId IS NULL) are
     * NEVER returned — settings shows only the rows the workspace controls.
     */
    listOverridesByWorkspace(workspaceId: string): Promise<readonly PricingRow[]>;

    /**
     * Delete a single override row. Returns true if a row was removed; false
     * when the row does not exist OR belongs to a different workspace.
     */
    deleteOverride(input: { id: string; workspaceId: string }): Promise<boolean>;

    /**
     * Update an existing workspace-scoped override row in place. The repo
     * enforces that the row matches both `id` and `workspaceId`; returns the
     * updated row or `null` when no row matched.
     */
    updateOverride(input: {
        id: string;
        workspaceId: string;
        row: NewPricingRow;
        effectiveTo: Date | null;
    }): Promise<PricingRow | null>;
}
