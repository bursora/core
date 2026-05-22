-- Per-workspace spike-protection configuration. One row per workspace; absence
-- of a row means "use defaults" (multiplier 5, enabled per the global env
-- flag). The middleware reads this row on every ingest to decide whether to
-- evaluate baseline-vs-burst and what multiplier to apply.
--
-- `threshold_multiplier` is stored as numeric so the dashboard slider can
-- offer fractional steps (2.5x, 3.5x) without losing precision.
CREATE TABLE "workspace_spike_protection_settings" (
    "workspace_id"          uuid PRIMARY KEY REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "enabled"               boolean NOT NULL DEFAULT true,
    "threshold_multiplier"  numeric(6, 2) NOT NULL DEFAULT 5,
    "updated_at"            timestamptz NOT NULL DEFAULT now()
);
