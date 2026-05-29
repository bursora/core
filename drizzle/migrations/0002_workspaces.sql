CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"environment" text DEFAULT 'prod' NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"subscription_status" text,
	"subscribed_at" timestamp with time zone,
	"refund_eligible_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_provider_customer_idx" ON "workspaces" USING btree ("provider_customer_id");
