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

-- Dedup pre-pass: the old index was `NULLS DISTINCT`, so workspace-level budget
-- rows (scope_id IS NULL) were never deduped and duplicate
-- (workspace_id, NULL scope_id, period_from) kind='budget' rows can already
-- exist. `NULLS NOT DISTINCT` would reject them, so collapse each duplicate set
-- to its earliest row before recreating the index (mirrors migration 0037).
WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY workspace_id, period_from
               ORDER BY raised_at ASC, id ASC
           ) AS rn
    FROM "alerts"
    WHERE kind = 'budget' AND scope_id IS NULL
)
DELETE FROM "alerts" a
USING ranked r
WHERE a.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX "alerts_budget_crossing_uniq"
    ON "alerts" ("workspace_id", "scope_id", "period_from")
    NULLS NOT DISTINCT
    WHERE "kind" = 'budget';
