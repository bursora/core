-- Partitioned parent table. Hand-written because drizzle-kit cannot emit
-- `PARTITION BY RANGE`. Indexes on the parent are inherited by all partitions
-- (Postgres 11+). Column shape mirrors the Drizzle declaration in schema.ts;
-- the partitioning, BRIN index, lookup btree, partial indexes, and the monthly
-- partitions are all folded in here.
CREATE TABLE "usage_events" (
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"tenant_id" text,
	"agent_id" text,
	"workflow_id" text,
	"provider" text,
	"model" text,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cache_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"cost_usd" numeric(14, 8) NOT NULL,
	"request_id" text,
	"status" text DEFAULT 'ok' NOT NULL,
	"decided_by_budget_id" uuid,
	"block_reason" text,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_id_ts_pk" PRIMARY KEY("id","ts")
) PARTITION BY RANGE ("ts");
--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_decided_by_budget_id_budgets_id_fk" FOREIGN KEY ("decided_by_budget_id") REFERENCES "public"."budgets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_events_ts_brin" ON "usage_events" USING BRIN ("ts");--> statement-breakpoint
CREATE INDEX "usage_events_lookup_btree" ON "usage_events" USING btree ("workspace_id","tenant_id","agent_id","ts");--> statement-breakpoint
CREATE INDEX "usage_events_workspace_status_ts_idx" ON "usage_events" USING btree ("workspace_id","status","ts");--> statement-breakpoint
-- Partial index for the Blocks tab read shape (decided_by_budget_id + ts DESC,
-- status='blocked' only). drizzle-kit cannot emit partial indexes.
CREATE INDEX "usage_events_blocks_lookup" ON "usage_events" USING btree ("decided_by_budget_id","ts" DESC) WHERE "status" = 'blocked';--> statement-breakpoint
-- Partition-aware idempotency index: dedupe SDK retries per (workspace_id,
-- request_id) with the partition key `ts` trailing. Partial on
-- request_id IS NOT NULL so optional-requestId rows are exempt.
CREATE UNIQUE INDEX "usage_events_workspace_request_uidx" ON "usage_events" USING btree ("workspace_id","request_id","ts") WHERE "request_id" IS NOT NULL;--> statement-breakpoint
-- Create the next 13 monthly partitions starting from the current month.
DO $$
DECLARE
  start_ts  timestamptz := date_trunc('month', now());
  i         int;
  part_name text;
  part_from text;
  part_to   text;
BEGIN
  FOR i IN 0..12 LOOP
    part_name := format('usage_events_%s', to_char(start_ts + (i || ' months')::interval, 'YYYY_MM'));
    part_from := to_char(start_ts + (i     || ' months')::interval, 'YYYY-MM-DD');
    part_to   := to_char(start_ts + ((i+1) || ' months')::interval, 'YYYY-MM-DD');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF "usage_events" FOR VALUES FROM (%L) TO (%L)',
      part_name, part_from, part_to
    );
  END LOOP;
END $$;
