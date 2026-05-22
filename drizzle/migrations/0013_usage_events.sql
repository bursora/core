-- Partitioned parent table. Hand-written because drizzle-kit cannot emit
-- `PARTITION BY RANGE`. Indexes on the parent are inherited by all
-- partitions (Postgres 11+).
CREATE TABLE "usage_events" (
  "id"                uuid NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      uuid NOT NULL,
  "tenant_id"         text,
  "agent_id"          text,
  "workflow_id"       text,
  -- provider/model are NULL on `status='blocked'` rows because no upstream
  -- call happened. Real usage rows always populate them.
  "provider"          text,
  "model"             text,
  "prompt_tokens"     integer NOT NULL DEFAULT 0,
  "completion_tokens" integer NOT NULL DEFAULT 0,
  "cache_tokens"      integer NOT NULL DEFAULT 0,
  "latency_ms"        integer,
  "cost_usd"          numeric(14,8) NOT NULL,
  "request_id"        text,
  "ts"                timestamptz NOT NULL DEFAULT now(),
  -- 'ok' for committed usage, 'blocked' for budget-tripped pre-flight rows.
  "status"            text NOT NULL DEFAULT 'ok',
  PRIMARY KEY ("id","ts")
) PARTITION BY RANGE ("ts");

CREATE INDEX "usage_events_ts_brin"      ON "usage_events" USING BRIN ("ts");
CREATE INDEX "usage_events_lookup_btree" ON "usage_events" ("workspace_id","tenant_id","agent_id","ts");

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
