/**
 * Shared filter param constants for the activity feed. Used by both the
 * server-rendered Settings → Activity tab and the internal activity API
 * route so the two stay in sync on allowed values, labels, and ranges.
 */

import type { ActivityKind, ActivitySeverity } from "./list-activity.usecase";

export const ACTIVITY_KIND_VALUES = [
    "event_ingested",
    "alert_raised",
    "key_issued",
    "key_revoked",
    "setup_error",
] as const satisfies readonly ActivityKind[];

export const ACTIVITY_SEVERITY_VALUES = [
    "info",
    "warning",
    "critical",
] as const satisfies readonly ActivitySeverity[];

export const ACTIVITY_RANGE_VALUES = ["24h", "7d", "30d"] as const;

export type ActivityRange = (typeof ACTIVITY_RANGE_VALUES)[number];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const ACTIVITY_RANGE_MS: Record<ActivityRange, number> = {
    "24h": DAY_MS,
    "7d": 7 * DAY_MS,
    "30d": 30 * DAY_MS,
};

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
    event_ingested: "Event ingested",
    alert_raised: "Alert raised",
    key_issued: "Key issued",
    key_revoked: "Key revoked",
    setup_error: "Setup error",
};

export function parseActivityOption<T extends string>(
    value: string | undefined,
    allowed: readonly T[],
): T | null {
    if (value === undefined) return null;
    return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}
