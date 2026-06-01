-- Move billing state from the workspace to the subscribing user.
-- Greenfield: no live subscriptions exist yet, so the dropped workspace
-- columns carry no data worth backfilling. The new user_subscriptions table
-- starts empty; rows are created on first Checkout activation.
CREATE TABLE "user_subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"subscription_status" text,
	"subscribed_at" timestamp with time zone,
	"refund_eligible_until" timestamp with time zone
);
--> statement-breakpoint
DROP INDEX "workspaces_provider_customer_idx";--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_subscriptions_provider_customer_idx" ON "user_subscriptions" USING btree ("provider_customer_id");--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "provider_customer_id";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "provider_subscription_id";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "subscription_status";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "subscribed_at";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "refund_eligible_until";