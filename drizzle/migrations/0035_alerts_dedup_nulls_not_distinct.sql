-- Harden the budget-alert dedup index against NULL scope_id.
--
-- The partial unique index from migration 0012 is
--   (workspace_id, scope_id, period_from) WHERE kind = 'budget'.
-- `scope_id` is text NULL. Postgres' default `NULLS DISTINCT` treats two
-- NULL `scope_id` rows as distinct, so the partial unique constraint does
-- NOT dedupe workspace-level budget crossings (scope_id IS NULL). That
-- defeats the `onConflictDoNothing` guard in `recordBudgetCrossing` and
-- can fire duplicate workspace-cap notifications inside a single window.
--
-- Recreate the index with `NULLS NOT DISTINCT` so a NULL scope_id collides
-- with another NULL scope_id and the conflict resolves cleanly.
DROP INDEX IF EXISTS "alerts_budget_crossing_uniq";

CREATE UNIQUE INDEX "alerts_budget_crossing_uniq"
    ON "alerts" ("workspace_id", "scope_id", "period_from")
    NULLS NOT DISTINCT
    WHERE "kind" = 'budget';
