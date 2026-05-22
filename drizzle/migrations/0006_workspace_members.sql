CREATE TABLE "workspace_members" (
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role"         text NOT NULL DEFAULT 'member',
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("workspace_id", "user_id")
);
