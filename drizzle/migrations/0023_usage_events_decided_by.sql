-- Surface the budget that tripped a denial on every `status='blocked'`
-- usage_events row. Foundation for the blocked-call drilldown on /budgets
-- and the dashboard banner enrichment.
--
-- `decided_by_budget_id` is NULL on `status='ok'` rows (real usage) and on
-- any blocked row written before this column existed. ON DELETE SET NULL so
-- blocked rows stay queryable after the originating budget is removed.
-- Postgres 12+ supports a FK from a partitioned table to an unpartitioned
-- one; the constraint is inherited by every existing and future partition.
ALTER TABLE "usage_events"
    ADD COLUMN "decided_by_budget_id" uuid REFERENCES "budgets"("id") ON DELETE SET NULL;

CREATE INDEX "usage_events_decided_by_budget_id"
    ON "usage_events" ("decided_by_budget_id");
