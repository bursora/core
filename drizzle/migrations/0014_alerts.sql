CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text,
	"reason" text NOT NULL,
	"deviation" numeric(14, 6) NOT NULL,
	"severity" text NOT NULL,
	"period_from" timestamp with time zone,
	"window_cost_usd" numeric(14, 8),
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerts_scope_type_check" CHECK ("scope_type" IN ('workspace','tenant','agent','budget')),
	CONSTRAINT "alerts_severity_check" CHECK ("severity" IN ('warning','critical'))
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_workspace_raised_idx" ON "alerts" USING btree ("workspace_id","raised_at");--> statement-breakpoint
-- Partial unique: budget rows dedupe per (workspace, scope, window). Declared
-- NULLS NOT DISTINCT so workspace-level crossings (scope_id IS NULL) collide on
-- conflict; drizzle-kit's uniqueIndex builder has no API for that clause on a
-- partial index, so the SQL is authored by hand here.
CREATE UNIQUE INDEX "alerts_budget_crossing_uniq" ON "alerts" USING btree ("workspace_id","scope_id","period_from") NULLS NOT DISTINCT WHERE "alerts"."kind" = 'budget';
