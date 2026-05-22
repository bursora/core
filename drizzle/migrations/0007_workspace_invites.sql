CREATE TABLE "workspace_invites" (
  "token"        text PRIMARY KEY,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "email"        text NOT NULL,
  "invited_by"   uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role"         text NOT NULL DEFAULT 'member',
  "expires_at"   timestamptz NOT NULL,
  "accepted_at"  timestamptz,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "workspace_invites_workspace_idx" ON "workspace_invites" ("workspace_id");
CREATE INDEX "workspace_invites_email_idx"     ON "workspace_invites" ("email");
