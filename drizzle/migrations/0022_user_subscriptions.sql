CREATE TABLE "user_subscriptions" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"subscription_status" text,
	"subscribed_at" timestamp with time zone,
	"refund_eligible_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_subscriptions_provider_customer_idx" ON "user_subscriptions" USING btree ("provider_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_subscriptions_provider_subscription_idx" ON "user_subscriptions" USING btree ("provider_subscription_id");
