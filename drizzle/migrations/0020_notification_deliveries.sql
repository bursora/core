-- Per-attempt log of webhook deliveries to Slack / Discord channels.
-- Powers the dashboard "channel health" status-strip dots.
--
-- The latest row per (workspace, channel_kind) drives the dot color and
-- tooltip. A 24h failure count over `status='failed'` flips the dot to
-- destructive when channels are misbehaving repeatedly.
--
-- `target` stores a SHA-256 hex hash of the webhook URL or channel id.
-- We MUST NOT persist the raw secret. The hash is opaque to the user
-- and good enough to correlate failures to a specific endpoint.
--
-- `error` is truncated to 500 chars at write time (in application code).
--
-- The composite index leads with workspace_id + channel_kind so the
-- "latest per kind for a workspace" lookup is an index seek into the
-- desc-ordered tail.
CREATE TYPE "notification_channel_kind" AS ENUM ('slack', 'discord');
CREATE TYPE "notification_delivery_status" AS ENUM ('ok', 'failed');

CREATE TABLE "notification_deliveries" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "channel_kind" notification_channel_kind NOT NULL,
  "target"       text NOT NULL,
  "status"       notification_delivery_status NOT NULL,
  "error"        text,
  "attempted_at" timestamptz NOT NULL DEFAULT now(),
  "latency_ms"   integer
);

CREATE INDEX "notification_deliveries_lookup_idx"
    ON "notification_deliveries" ("workspace_id", "channel_kind", "attempted_at" DESC);
