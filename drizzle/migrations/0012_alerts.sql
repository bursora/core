-- Append-only feed of raised anomalies and budget crossings. Detection cron
-- writes one anomaly row per (workspace, scope); budget evaluation writes
-- one row per crossing. Dashboard reads recent rows ordered by raised_at.
-- `period_from` carries the budget's window start so a partial unique index
-- can dedupe budget notifications per crossing.
CREATE TABLE "alerts" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "kind"         text NOT NULL,
  "scope_type"   text NOT NULL,
  "scope_id"     text,
  "reason"       text NOT NULL,
  "deviation"    numeric(14,6) NOT NULL,
  "severity"     text NOT NULL,
  "period_from"  timestamptz,
  "raised_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "alerts_scope_type_check" CHECK ("scope_type" IN ('workspace','tenant','agent','budget')),
  CHECK ("severity" IN ('warning','critical'))
);

CREATE INDEX "alerts_workspace_raised_idx" ON "alerts" ("workspace_id", "raised_at");

CREATE UNIQUE INDEX "alerts_budget_crossing_uniq"
    ON "alerts" ("workspace_id", "scope_id", "period_from")
    WHERE "kind" = 'budget';
