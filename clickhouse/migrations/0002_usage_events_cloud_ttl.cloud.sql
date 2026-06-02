-- Cloud-only retention. Caps usage_events at the documented CLOUD_RETENTION_DAYS
-- window (see lib/metering/retention-policy.ts). The `.cloud` version suffix
-- gates this file to IS_CLOUD deploys in clickhouse/migrate.ts, so self-host
-- keeps usage_events indefinitely. A test asserts the day count below matches
-- CLOUD_RETENTION_DAYS so the retention promise cannot silently drift.
--
-- Single statement: the migration runner splits files on the semicolon
-- character, so this file must contain no other semicolons (comments included).
ALTER TABLE usage_events MODIFY TTL toDateTime(ts) + INTERVAL 90 DAY
