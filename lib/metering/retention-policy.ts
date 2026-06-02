/**
 * Retention policy: the number of days `usage_events` rows are kept on cloud.
 *
 * Cloud workspaces share a single 90-day retention window, enforced by the
 * cloud-only TTL migration (`clickhouse/migrations/0002_usage_events_cloud_ttl.cloud.sql`).
 * Self-host applies no TTL and keeps usage_events indefinitely. This constant
 * is the documented number; a test asserts it matches the DDL so the promise
 * can't silently drift.
 */

export const CLOUD_RETENTION_DAYS = 90;
