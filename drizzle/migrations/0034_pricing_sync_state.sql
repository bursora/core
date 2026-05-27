-- Heartbeat for the daily pricing sync cron. One row, identified by `id = 1`.
-- The sync use case writes `last_synced_at = now()` only on a fully successful
-- run (every source returned rates without throwing). A stale value is the
-- signal Bursora is billing against potentially out-of-date provider rates;
-- any future freshness check / dashboard tile reads this column directly.
CREATE TABLE "pricing_sync_state" (
    "id"               integer PRIMARY KEY CHECK ("id" = 1),
    "last_synced_at"   timestamptz NOT NULL
);
