CREATE TYPE "public"."notification_channel_kind" AS ENUM('slack', 'discord', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status" AS ENUM('ok', 'failed');--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"channel_kind" "notification_channel_kind" NOT NULL,
	"target" text NOT NULL,
	"status" "notification_delivery_status" NOT NULL,
	"error" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"latency_ms" integer
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_deliveries_lookup_idx" ON "notification_deliveries" USING btree ("workspace_id","channel_kind","attempted_at");
