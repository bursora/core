CREATE TABLE "pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"region" text DEFAULT 'global' NOT NULL,
	"input_per_1m_usd" numeric(12, 6) NOT NULL,
	"output_per_1m_usd" numeric(12, 6) NOT NULL,
	"cache_per_1m_usd" numeric(12, 6),
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_check" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);
--> statement-breakpoint
ALTER TABLE "pricing" ADD CONSTRAINT "pricing_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Exclusion constraint: no overlapping effective ranges per
-- (provider, model, region, workspace_id). Coalesce keeps NULL workspace rows
-- mutually exclusive while allowing one override per workspace. Requires
-- btree_gist (migration 0000); drizzle-kit cannot emit EXCLUDE constraints.
ALTER TABLE "pricing" ADD CONSTRAINT "pricing_no_overlap" EXCLUDE USING gist (
	"provider"  WITH =,
	"model"     WITH =,
	"region"    WITH =,
	coalesce("workspace_id", '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
	tstzrange("effective_from", coalesce("effective_to", 'infinity'::timestamptz)) WITH &&
);--> statement-breakpoint
CREATE INDEX "pricing_lookup_idx" ON "pricing" USING btree ("provider","model","region","effective_from");--> statement-breakpoint
CREATE INDEX "pricing_workspace_idx" ON "pricing" USING btree ("workspace_id");
