CREATE TABLE "workspace_event_bundle_usage" (
	"workspace_id" uuid NOT NULL,
	"month" text NOT NULL,
	"events_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_event_bundle_usage_workspace_id_month_pk" PRIMARY KEY("workspace_id","month")
);
--> statement-breakpoint
ALTER TABLE "workspace_event_bundle_usage" ADD CONSTRAINT "workspace_event_bundle_usage_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
