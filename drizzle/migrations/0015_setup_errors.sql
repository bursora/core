CREATE TABLE "setup_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"category" text NOT NULL,
	"bucket_hour" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setup_errors_category_check" CHECK ("category" IN ('auth_revoked','ingest_invalid_body','auth_unknown'))
);
--> statement-breakpoint
ALTER TABLE "setup_errors" ADD CONSTRAINT "setup_errors_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "setup_errors_workspace_bucket_idx" ON "setup_errors" USING btree ("workspace_id","bucket_hour");--> statement-breakpoint
-- Upsert key declared NULLS NOT DISTINCT so the global (workspace_id NULL)
-- bucket deduplicates. drizzle-kit's uniqueIndex builder cannot emit that
-- modifier, so the SQL is authored by hand here.
CREATE UNIQUE INDEX "setup_errors_bucket_uniq" ON "setup_errors" USING btree ("workspace_id","category","bucket_hour") NULLS NOT DISTINCT;
