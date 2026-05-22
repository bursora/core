-- Usage-based billing state on the workspace row. Four new nullable columns:
--   subscribed_at         → when Checkout first completed; the rollup cron
--                            pro-rates the first invoice from this date.
--   refund_eligible_until  → subscribed_at + 30 days; the dashboard reads
--                            this to render the money-back badge. Refund
--                            execution itself lands in a follow-up; this
--                            column only carries the window.
--   last_invoice_id        → most recent invoice id pushed by the rollup
--                            cron. Deep-link target on the dashboard;
--                            unique so an admin can reverse-lookup a
--                            workspace from a Stripe invoice id.
--   last_billed_month      → YYYY-MM. Lets a retried cron skip months it
--                            already invoiced.

ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "subscribed_at"          timestamptz;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "refund_eligible_until"  timestamptz;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "last_invoice_id"        text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "last_billed_month"      text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_last_invoice_idx" ON "workspaces" ("last_invoice_id");
