-- Cloud-only event bundle metering. Two tables: a per-workspace settings row
-- holding the optional hard cap (in cents) and a per-(workspace, calendar
-- month) usage rollup that doubles as the cold store for the Redis counter
-- and the canonical billing source for overage.
--
-- `hard_cap_usd_cents` is nullable so workspaces can opt in to a cap without
-- the schema forcing one. `month` is stored as `YYYY-MM` text — calendar
-- months are timezone-agnostic in this context (UTC) and the format reads
-- straight out of dashboards.
CREATE TABLE "workspace_event_bundle_settings" (
    "workspace_id"          uuid PRIMARY KEY REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "hard_cap_usd_cents"    integer,
    "updated_at"            timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workspace_event_bundle_usage" (
    "workspace_id"          uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "month"                 text NOT NULL,
    "events_count"          integer NOT NULL DEFAULT 0,
    "overage_cents"         integer NOT NULL DEFAULT 0,
    "updated_at"            timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("workspace_id", "month")
);
