-- Provider-neutral billing rename. Pre-launch DB is empty so this is a pure
-- DDL pass with no data migration step:
--   workspaces.stripe_customer_id     → provider_customer_id
--   workspaces.stripe_subscription_id → provider_subscription_id
--   workspaces.last_invoice_id        → last_invoice_ref
--   stripe_webhook_events             → billing_webhook_events
-- The unique indexes on the renamed workspace columns are recreated under
-- provider-neutral names so the new schema declarations match what Drizzle
-- expects to find in the database.

ALTER TABLE "workspaces" RENAME COLUMN "stripe_customer_id" TO "provider_customer_id";--> statement-breakpoint
ALTER TABLE "workspaces" RENAME COLUMN "stripe_subscription_id" TO "provider_subscription_id";--> statement-breakpoint
ALTER TABLE "workspaces" RENAME COLUMN "last_invoice_id" TO "last_invoice_ref";--> statement-breakpoint
ALTER INDEX "workspaces_stripe_customer_idx" RENAME TO "workspaces_provider_customer_idx";--> statement-breakpoint
ALTER INDEX "workspaces_last_invoice_idx" RENAME TO "workspaces_last_invoice_ref_idx";--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" RENAME TO "billing_webhook_events";
