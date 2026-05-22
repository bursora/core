-- Per-(user, workspace) inbox of notification rows. Each row is a discrete
-- event delivered to one user. Producers fan out one row per workspace
-- member when a new event fires (e.g. a new hourly setup-error bucket);
-- `dedup_key` keeps fan-outs idempotent under retries.
--
-- The bell reads notifications across every workspace the user belongs to,
-- so the list index leads with `user_id` (not workspace). The dashboard
-- banner adds `workspace_id` as an extra filter on top of the user partition.
CREATE TABLE "notifications" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id"      uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "source"       text NOT NULL,
  "dedup_key"    text NOT NULL,
  "severity"     text NOT NULL,
  "title"        text NOT NULL,
  "body"         text NOT NULL,
  "href"         text,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "read_at"      timestamptz
);

CREATE UNIQUE INDEX "notifications_dedup_uniq"
    ON "notifications" ("workspace_id", "user_id", "dedup_key");

CREATE INDEX "notifications_list_idx"
    ON "notifications" ("user_id", "read_at", "created_at");
