-- NULL workspace_id = global rate from daily cron; non-NULL = workspace override.
CREATE TABLE "pricing" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"       uuid REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "provider"           text NOT NULL,
  "model"              text NOT NULL,
  "region"             text NOT NULL DEFAULT 'global',
  "input_per_1m_usd"   numeric(12,6) NOT NULL,
  "output_per_1m_usd"  numeric(12,6) NOT NULL,
  "cache_per_1m_usd"   numeric(12,6),
  "effective_from"     timestamptz NOT NULL,
  "effective_to"       timestamptz,
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);

CREATE INDEX "pricing_lookup_idx"    ON "pricing" ("provider","model","region","effective_from");
CREATE INDEX "pricing_workspace_idx" ON "pricing" ("workspace_id");

-- Exclusion constraint: no overlapping effective ranges per
-- (provider, model, region, workspace_id). Coalesce keeps NULL workspace rows
-- mutually exclusive while allowing one override per workspace.
ALTER TABLE "pricing" ADD CONSTRAINT "pricing_no_overlap" EXCLUDE USING gist (
  "provider"  WITH =,
  "model"     WITH =,
  "region"    WITH =,
  coalesce("workspace_id", '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
  tstzrange("effective_from", coalesce("effective_to", 'infinity'::timestamptz)) WITH &&
);
