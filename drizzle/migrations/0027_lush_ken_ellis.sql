-- Usage events moved to ClickHouse (the canonical event store). Drop the
-- partitioned Postgres parent; CASCADE also drops every monthly partition
-- (`usage_events_YYYY_MM`), the inherited indexes, and the FK to budgets.
DROP TABLE IF EXISTS "usage_events" CASCADE;