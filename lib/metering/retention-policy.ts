/**
 * Retention policy: the number of days `usage_events` rows are kept on cloud.
 *
 * Cloud workspaces share a single 90-day retention window. Self-host has no
 * retention — the prune cron is cloud-only.
 */

export const CLOUD_RETENTION_DAYS = 90;

export const LONGEST_RETENTION_DAYS = CLOUD_RETENTION_DAYS;
