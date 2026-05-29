CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text,
	"period" text NOT NULL,
	"amount_usd" numeric(12, 4) NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_scope_type_check" CHECK ("scope_type" IN ('workspace','tenant','agent','workflow')),
	CONSTRAINT "budgets_period_check" CHECK ("period" IN ('daily','weekly','monthly')),
	CONSTRAINT "budgets_mode_check" CHECK ("mode" IN ('notify','throttle','block'))
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budgets_scope_idx" ON "budgets" USING btree ("workspace_id","scope_type","scope_id");
