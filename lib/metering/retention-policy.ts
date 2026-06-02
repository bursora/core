/**
 * Retention policy: the number of days `usage_events` rows are kept on cloud.
 *
 * Cloud workspaces share a single 90-day retention window, enforced by the
 * ClickHouse table TTL (`clickhouse/migrations/0001_usage_events.sql`). This
 * constant is the documented number; a test asserts it matches the DDL so the
 * promise can't silently drift.
 */

export const CLOUD_RETENTION_DAYS = 90;
