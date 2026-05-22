-- Denormalize the 5-minute anomaly bucket spend onto the `alerts` row so
-- dashboards, webhooks, emails, and in-app notifications can render
-- "$X.XX spent between HH:MM-HH:MM" without re-querying usage_events.
-- `raised_at` already pins the bucket start; the end is raised_at + 5 minutes.
-- NULL for budget rows; anomaly rows are populated by the detection cron.
ALTER TABLE "alerts"
    ADD COLUMN "window_cost_usd" numeric(14, 8);
