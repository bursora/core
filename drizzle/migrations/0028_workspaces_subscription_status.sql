-- Drop the obsolete `plan` column on workspaces. Cloud is a single paid tier;
-- self-host has no tiers. Subscription state lives in the new
-- `subscription_status` column, populated by the Stripe webhook handler.

ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "plan";--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "subscription_status" text;
