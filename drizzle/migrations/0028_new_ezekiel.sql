DROP INDEX "user_subscriptions_provider_customer_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "user_subscriptions_provider_subscription_idx" ON "user_subscriptions" USING btree ("provider_subscription_id");--> statement-breakpoint
CREATE INDEX "user_subscriptions_provider_customer_idx" ON "user_subscriptions" USING btree ("provider_customer_id");