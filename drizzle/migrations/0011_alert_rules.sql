CREATE TABLE "alert_rules" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "kind"         text NOT NULL,
  "params"       jsonb NOT NULL DEFAULT '{}'::jsonb,
  "channels"     jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
