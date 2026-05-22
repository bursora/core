-- Replaces the all-rows index on `decided_by_budget_id` with a partial
-- compound index that matches the Blocks-tab read shape.
--
-- The original `usage_events_decided_by_budget_id` index covered every row,
-- but `decided_by_budget_id` is NULL on `status='ok'` rows (the vast
-- majority). That meant the bulk of the index was unreachable for any
-- query — pure write amplification.
--
-- The replacement narrows to `status = 'blocked'` and adds `ts DESC` so the
-- Blocks-tab query (`WHERE decided_by_budget_id = $1 AND status = 'blocked'
-- ORDER BY ts DESC`) walks the index without a separate sort step.
DROP INDEX IF EXISTS "usage_events_decided_by_budget_id";

CREATE INDEX "usage_events_blocks_lookup"
    ON "usage_events" ("decided_by_budget_id", "ts" DESC)
    WHERE "status" = 'blocked';
