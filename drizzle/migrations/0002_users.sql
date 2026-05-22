-- Owned by better-auth via `modelName: "users"`. Single source of truth for
-- both auth (session/account) and domain (workspace_members/invites) FKs.
CREATE TABLE "users" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"           text NOT NULL,
  "email"          text NOT NULL UNIQUE,
  "email_verified" boolean NOT NULL DEFAULT false,
  "image"          text,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now()
);
