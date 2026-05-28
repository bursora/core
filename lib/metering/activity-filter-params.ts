/**
 * Shared filter param constants and URL (de)serialization for the activity
 * feed. Used by both the server-rendered Settings → Activity tab and the
 * internal activity API route so the two stay in sync on allowed values,
 * labels, ranges, and URL shape.
 *
 * Two helpers form the URL contract:
 *   - `serializeActivityFilters` writes the canonical `URLSearchParams`. Drops
 *     undefined fields so the URL stays clean (no defaults polluted in).
 *   - `deserializeActivityFilters` parses any `URLSearchParams`. Unknown keys
 *     are ignored; invalid values drop to undefined.
 *
 * Round-trip is stable for any valid `ActivityFilterParams`.
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

/**
 * Canonical typed shape of the activity-feed URL params. The page mode uses
 * `from`/`to`; the API route uses `range`. Both modes share `kind`,
 * `severity`, and `cursor`. Callers fill only the fields they need.
 */
export interface ActivityFilterParams {
    readonly kind?: ActivityKind;
    readonly severity?: ActivitySeverity;
    readonly range?: ActivityRange;
    readonly from?: Date;
    readonly to?: Date;
    readonly cursor?: string;
}

const CURSOR_PATTERN = /^\d+$/;
const CURSOR_MAX_LENGTH = 500;

function parseIsoDate(raw: string | null): Date | undefined {
    if (raw === null) return undefined;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseCursor(raw: string | null): string | undefined {
    if (raw === null) return undefined;
    if (raw.length === 0 || raw.length > CURSOR_MAX_LENGTH) return undefined;
    return CURSOR_PATTERN.test(raw) ? raw : undefined;
}

export function serializeActivityFilters(params: ActivityFilterParams): URLSearchParams {
    const out = new URLSearchParams();
    if (params.kind !== undefined) out.set("kind", params.kind);
    if (params.severity !== undefined) out.set("severity", params.severity);
    if (params.range !== undefined) out.set("range", params.range);
    if (params.from !== undefined) out.set("from", params.from.toISOString());
    if (params.to !== undefined) out.set("to", params.to.toISOString());
    if (params.cursor !== undefined) out.set("cursor", params.cursor);
    return out;
}

export function deserializeActivityFilters(params: URLSearchParams): ActivityFilterParams {
    const kind = parseActivityOption(params.get("kind") ?? undefined, ACTIVITY_KIND_VALUES);
    const severity = parseActivityOption(
        params.get("severity") ?? undefined,
        ACTIVITY_SEVERITY_VALUES,
    );
    const range = parseActivityOption(params.get("range") ?? undefined, ACTIVITY_RANGE_VALUES);
    const from = parseIsoDate(params.get("from"));
    const to = parseIsoDate(params.get("to"));
    const cursor = parseCursor(params.get("cursor"));

    return {
        ...(kind !== null ? { kind } : {}),
        ...(severity !== null ? { severity } : {}),
        ...(range !== null ? { range } : {}),
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
    };
}
