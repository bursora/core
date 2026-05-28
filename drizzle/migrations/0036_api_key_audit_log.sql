-- Append-only audit trail for `api_keys` lifecycle.
--
-- Every successful create / revoke / rename writes a row here so a workspace
-- can answer "who did what, from where, when?" without reconstructing it from
-- application logs. `user_id` is ON DELETE SET NULL so the audit row outlives
-- a user removal; `metadata` is jsonb so per-action shape can grow without a
-- schema migration.
CREATE TABLE "api_key_audit_log" (
    "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "api_key_id"   uuid NOT NULL,
    "user_id"      uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "action"       text NOT NULL, -- 'create' | 'revoke' | 'rename'
    "metadata"     jsonb,
    "ip"           text,
    "ts"           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "api_key_audit_log_workspace_ts_idx"
    ON "api_key_audit_log" ("workspace_id", "ts" DESC);
