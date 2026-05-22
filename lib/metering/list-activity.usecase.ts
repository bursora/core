import type { AnomalyAlert } from "../detection";
import type { Severity } from "../severity";

export type ActivityKind =
    | "event_ingested"
    | "alert_raised"
    | "key_issued"
    | "key_revoked"
    | "setup_error";

export type ActivitySeverity = Severity;

export interface ActivityItem {
    readonly kind: ActivityKind;
    readonly at: Date;
    readonly summary: string;
    readonly severity?: ActivitySeverity;
    readonly scope?: string;
}

export interface EventBucket {
    readonly at: Date;
    readonly count: number;
}

export interface KeyEvent {
    readonly id: string;
    readonly createdAt: Date;
    readonly revokedAt: Date | null;
}

export interface SetupErrorEvent {
    readonly category: string;
    readonly count: number;
    readonly at: Date;
}

export interface ListActivityInput {
    readonly workspaceId: string;
    readonly limit?: number;
    readonly now?: Date;
    readonly fetchEventBuckets: (
        workspaceId: string,
        since: Date,
    ) => Promise<readonly EventBucket[]>;
    readonly fetchAlerts: (
        workspaceId: string,
        since: Date,
        limit: number,
    ) => Promise<readonly AnomalyAlert[]>;
    readonly fetchKeyEvents: (workspaceId: string, since: Date) => Promise<readonly KeyEvent[]>;
    readonly fetchSetupErrors?: (
        workspaceId: string,
        since: Date,
    ) => Promise<readonly SetupErrorEvent[]>;
}

export const DEFAULT_ACTIVITY_LIMIT = 50;

const ACTIVITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const SETUP_ERROR_LABELS: Record<string, string> = {
    auth_revoked: "Unrecognized API key",
    ingest_invalid_body: "Invalid ingest payload",
    auth_unknown: "Unknown API key",
};

function mergeActivity(args: {
    readonly buckets: readonly EventBucket[];
    readonly alerts: readonly AnomalyAlert[];
    readonly keyEvents: readonly KeyEvent[];
    readonly setupErrors: readonly SetupErrorEvent[];
    readonly since: Date;
}): ActivityItem[] {
    const items: ActivityItem[] = [];

    for (const b of args.buckets) {
        if (b.count <= 0) continue;
        items.push({
            kind: "event_ingested",
            at: b.at,
            summary: `${b.count} event${b.count === 1 ? "" : "s"} in past hour`,
        });
    }

    for (const a of args.alerts) {
        items.push({
            kind: "alert_raised",
            at: a.raisedAt,
            summary: a.reason,
            severity: a.severity,
            ...(a.scope.tenantId
                ? { scope: `tenant:${a.scope.tenantId}` }
                : a.scope.agentId
                  ? { scope: `agent:${a.scope.agentId}` }
                  : {}),
        });
    }

    for (const e of args.setupErrors) {
        if (e.count <= 0) continue;
        const label = SETUP_ERROR_LABELS[e.category] ?? e.category;
        items.push({
            kind: "setup_error",
            at: e.at,
            summary:
                e.count === 1 ? `${label} (1 occurrence)` : `${label} (${e.count} occurrences)`,
            severity: "warning",
            scope: e.category,
        });
    }

    for (const k of args.keyEvents) {
        const short = k.id.slice(-4);
        if (k.createdAt.getTime() >= args.since.getTime()) {
            items.push({
                kind: "key_issued",
                at: k.createdAt,
                summary: `Key ...${short} issued`,
            });
        }
        if (k.revokedAt !== null && k.revokedAt.getTime() >= args.since.getTime()) {
            items.push({
                kind: "key_revoked",
                at: k.revokedAt,
                summary: `Key ...${short} revoked`,
            });
        }
    }

    items.sort((a, b) => b.at.getTime() - a.at.getTime());
    return items;
}

export async function listActivityUseCase(
    input: ListActivityInput,
): Promise<readonly ActivityItem[]> {
    const limit = input.limit ?? DEFAULT_ACTIVITY_LIMIT;
    const now = input.now ?? new Date();
    const since = new Date(now.getTime() - ACTIVITY_WINDOW_MS);

    const [buckets, alerts, keyEvents, setupErrors] = await Promise.all([
        input.fetchEventBuckets(input.workspaceId, since),
        input.fetchAlerts(input.workspaceId, since, limit),
        input.fetchKeyEvents(input.workspaceId, since),
        input.fetchSetupErrors?.(input.workspaceId, since) ?? Promise.resolve([]),
    ]);

    return mergeActivity({ buckets, alerts, keyEvents, setupErrors, since }).slice(0, limit);
}

export interface ActivityFilters {
    readonly kind?: ActivityKind;
    readonly severity?: ActivitySeverity;
    readonly from?: Date;
    readonly to?: Date;
}

export interface ListActivityPageInput {
    readonly workspaceId: string;
    readonly limit?: number;
    readonly now?: Date;
    readonly cursor?: string | null;
    readonly filters?: ActivityFilters;
    readonly fetchEventBuckets: (
        workspaceId: string,
        since: Date,
    ) => Promise<readonly EventBucket[]>;
    readonly fetchAlerts: (
        workspaceId: string,
        since: Date,
        limit: number,
    ) => Promise<readonly AnomalyAlert[]>;
    readonly fetchKeyEvents: (workspaceId: string, since: Date) => Promise<readonly KeyEvent[]>;
    readonly fetchSetupErrors?: (
        workspaceId: string,
        since: Date,
    ) => Promise<readonly SetupErrorEvent[]>;
}

export interface ActivityPage {
    readonly items: readonly ActivityItem[];
    readonly nextCursor: string | null;
}

/**
 * Parses a cursor encoding a timestamp in milliseconds. Returns null on any
 * malformed input rather than throwing — pagination should degrade to a
 * fresh first page.
 */
export function parseActivityCursor(cursor: string | null | undefined): number | null {
    if (cursor === null || cursor === undefined || cursor === "") return null;
    const ms = Number.parseInt(cursor, 10);
    return Number.isFinite(ms) ? ms : null;
}

function encodeActivityCursor(at: Date): string {
    return String(at.getTime());
}

export async function listActivityPageUseCase(input: ListActivityPageInput): Promise<ActivityPage> {
    const limit = input.limit ?? DEFAULT_ACTIVITY_LIMIT;
    const now = input.now ?? new Date();
    const filters = input.filters ?? {};
    const since = filters.from ?? new Date(now.getTime() - ACTIVITY_WINDOW_MS);

    // Over-fetch alerts so the merged page can still hit `limit` after kind
    // filters drop non-matching rows. The window is also bounded by from/to.
    const overFetch = limit * 2 + 1;

    const [buckets, alerts, keyEvents, setupErrors] = await Promise.all([
        input.fetchEventBuckets(input.workspaceId, since),
        input.fetchAlerts(input.workspaceId, since, overFetch),
        input.fetchKeyEvents(input.workspaceId, since),
        input.fetchSetupErrors?.(input.workspaceId, since) ?? Promise.resolve([]),
    ]);

    let merged = mergeActivity({ buckets, alerts, keyEvents, setupErrors, since });

    if (filters.to !== undefined) {
        const toMs = filters.to.getTime();
        merged = merged.filter((i) => i.at.getTime() <= toMs);
    }
    if (filters.from !== undefined) {
        const fromMs = filters.from.getTime();
        merged = merged.filter((i) => i.at.getTime() >= fromMs);
    }
    if (filters.kind !== undefined) {
        merged = merged.filter((i) => i.kind === filters.kind);
    }
    if (filters.severity !== undefined) {
        merged = merged.filter((i) => i.severity === filters.severity);
    }

    const cursorMs = parseActivityCursor(input.cursor);
    if (cursorMs !== null) {
        merged = merged.filter((i) => i.at.getTime() < cursorMs);
    }

    const page = merged.slice(0, limit);
    const hasMore = merged.length > limit;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last !== undefined ? encodeActivityCursor(last.at) : null;

    return { items: page, nextCursor };
}
