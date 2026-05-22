CREATE TABLE "api_keys" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "key_hash"     text NOT NULL,
  "name"         text NOT NULL DEFAULT '',
  "scopes"       text[] NOT NULL DEFAULT '{}'::text[],
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "revoked_at"   timestamptz
);

CREATE UNIQUE INDEX "api_keys_key_hash_idx"  ON "api_keys" ("key_hash");
CREATE INDEX        "api_keys_workspace_idx" ON "api_keys" ("workspace_id");
