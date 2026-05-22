CREATE TABLE "budgets" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "scope_type"   text NOT NULL,
  "scope_id"     text,
  "period"       text NOT NULL,
  "amount_usd"   numeric(12,4) NOT NULL,
  "mode"         text NOT NULL,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  CHECK ("scope_type" IN ('workspace','tenant','agent','workflow')),
  CHECK ("period"     IN ('daily','weekly','monthly')),
  CHECK ("mode"       IN ('notify','throttle','block'))
);

CREATE INDEX "budgets_scope_idx" ON "budgets" ("workspace_id","scope_type","scope_id");
