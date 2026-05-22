-- Hourly counters of SDK setup failures. Two signal shapes share the table:
--   * Per-workspace (workspace_id NOT NULL):
--       - auth_revoked         — known workspace, unknown/revoked key
--       - ingest_invalid_body  — valid key but body failed validation
--     These are surfaced on the workspace dashboard banner.
--   * Global (workspace_id NULL):
--       - auth_unknown         — plaintext didn't parse or workspace missing.
--     Admin-only observability; never shown to a customer.
--
-- Writes are upserts keyed by the composite unique index. The index is
-- declared NULLS NOT DISTINCT so the NULL-workspace bucket also deduplicates.
CREATE TABLE "setup_errors" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "category"     text NOT NULL,
  "bucket_hour"  timestamptz NOT NULL,
  "count"        integer NOT NULL DEFAULT 0,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  CHECK ("category" IN ('auth_revoked','ingest_invalid_body','auth_unknown'))
);

CREATE UNIQUE INDEX "setup_errors_bucket_uniq"
    ON "setup_errors" ("workspace_id", "category", "bucket_hour")
    NULLS NOT DISTINCT;

CREATE INDEX "setup_errors_workspace_bucket_idx"
    ON "setup_errors" ("workspace_id", "bucket_hour");
