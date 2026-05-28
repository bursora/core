import "server-only";

import { db, schema, type Db } from "@/lib/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { errMessage } from "../error-message";
import { DrizzleMemberRepository } from "../identity/drizzle-member.repository";
import { NOTICE_LABELS } from "../notices/labels";
import {
    drizzleNotificationsRepository,
    type NotificationsRepository,
} from "../notifications/notifications.repository";
import { buildWorkspacePath } from "../routes";
import { type DashboardSetupErrorCategory, type SetupErrorCategory } from "./category";

export interface SetupErrorBucketRow {
    readonly category: SetupErrorCategory;
    readonly count: number;
    readonly latestBucketHour: Date;
}

export interface SetupErrorRepository {
    /**
     * Upserts the hourly bucket counter. Returns `{ created: true }` when the
     * row didn't exist and was inserted (count transitions 0→1); `{ created:
     * false }` when an existing row had its count incremented.
     */
    incrementBucket(input: {
        workspaceId: string | null;
        category: SetupErrorCategory;
        bucketHour: Date;
    }): Promise<{ created: boolean }>;
    sumByCategorySince(query: {
        workspaceId: string;
        since: Date;
    }): Promise<readonly SetupErrorBucketRow[]>;
}

export type RecordSetupErrorInput =
    | { readonly kind: "ingest_invalid_body"; readonly workspaceId: string }
    | { readonly kind: "sdk_unknown_provider"; readonly workspaceId: string }
    | {
          readonly kind: "auth_failure";
          /** Eight-char SHA-256 prefix of the offered plaintext; null when the header was missing. */
          readonly hashPrefix: string | null;
          /** Best-effort client IP from proxy headers; null when none was set. */
          readonly sourceIp: string | null;
      };

export interface SetupErrorsDeps {
    readonly repo: SetupErrorRepository;
    readonly now: () => Date;
    readonly notifications: NotificationsRepository;
    readonly listMemberUserIds: (workspaceId: string) => Promise<readonly string[]>;
}

let testOverride: SetupErrorsDeps | null = null;

export function setSetupErrorsDepsForTesting(deps: SetupErrorsDeps | null): void {
    testOverride = deps;
}

function defaultDeps(): SetupErrorsDeps {
    return {
        repo: drizzleSetupErrorRepository(db()),
        now: () => new Date(),
        notifications: drizzleNotificationsRepository(db()),
        listMemberUserIds: (workspaceId) =>
            new DrizzleMemberRepository(db()).listMemberUserIds(workspaceId),
    };
}

function deps(): SetupErrorsDeps {
    return testOverride ?? defaultDeps();
}

function drizzleSetupErrorRepository(db: Db): SetupErrorRepository {
    return {
        async incrementBucket(input) {
            // Postgres-specific: the system column `xmax` is 0 only for tuples
            // produced by the INSERT branch of `ON CONFLICT DO UPDATE` — the
            // UPDATE branch carries the transaction id that touched the row.
            // Lets the caller tell first-insert from increment without a
            // second round-trip. Don't widen this beyond the upsert path —
            // any concurrent UPDATE elsewhere would flip the flag.
            const [row] = await db
                .insert(schema.setupErrors)
                .values({
                    workspaceId: input.workspaceId,
                    category: input.category,
                    bucketHour: input.bucketHour,
                    count: 1,
                })
                .onConflictDoUpdate({
                    target: [
                        schema.setupErrors.workspaceId,
                        schema.setupErrors.category,
                        schema.setupErrors.bucketHour,
                    ],
                    set: { count: sql`${schema.setupErrors.count} + 1` },
                })
                .returning({ created: sql<boolean>`(xmax = 0)` });
            return { created: row?.created === true };
        },
        async sumByCategorySince(query) {
            const rows = await db
                .select({
                    category: schema.setupErrors.category,
                    count: sql<number>`sum(${schema.setupErrors.count})::int`,
                    latestBucketHour: sql<Date>`max(${schema.setupErrors.bucketHour})`,
                })
                .from(schema.setupErrors)
                .where(
                    and(
                        eq(schema.setupErrors.workspaceId, query.workspaceId),
                        gte(schema.setupErrors.bucketHour, query.since),
                    ),
                )
                .groupBy(schema.setupErrors.category);
            return rows.map((r) => ({
                category: r.category as SetupErrorCategory,
                count: Number(r.count),
                latestBucketHour: new Date(r.latestBucketHour),
            }));
        },
    };
}

function truncateToHour(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours()));
}

export async function recordSetupErrorUseCase(args: {
    input: RecordSetupErrorInput;
    now: Date;
    repo: SetupErrorRepository;
    notifications: NotificationsRepository;
    listMemberUserIds: (workspaceId: string) => Promise<readonly string[]>;
}): Promise<void> {
    const bucketHour = truncateToHour(args.now);
    if (args.input.kind === "ingest_invalid_body" || args.input.kind === "sdk_unknown_provider") {
        const category = args.input.kind;
        const { created } = await args.repo.incrementBucket({
            workspaceId: args.input.workspaceId,
            category,
            bucketHour,
        });
        if (created) {
            await fanOutSetupErrorNotification({
                workspaceId: args.input.workspaceId,
                category,
                bucketHour,
                notifications: args.notifications,
                listMemberUserIds: args.listMemberUserIds,
            });
        }
        return;
    }
    // Auth failures never attribute to a workspace: the offered key may
    // carry a forged workspace fragment, so logging it would let an
    // attacker pollute a victim's bucket and trigger false alarms. The
    // hash prefix + source IP correlate retries across logs without
    // exposing the key.
    console.warn("setup_error.auth_failure", {
        category: "auth_unknown",
        hashPrefix: args.input.hashPrefix,
        sourceIp: args.input.sourceIp,
    });
    await args.repo.incrementBucket({
        workspaceId: null,
        category: "auth_unknown",
        bucketHour,
    });
}

const SETUP_ERROR_DEDUP_PREFIX = "setup_error:";

// Inverse of the `setup_error:{category}:{iso}` key built in
// fanOutSetupErrorNotification. Returns null on foreign / legacy keys.
export function parseSetupErrorDedupKey(dedupKey: string): DashboardSetupErrorCategory | null {
    if (!dedupKey.startsWith(SETUP_ERROR_DEDUP_PREFIX)) return null;
    const category = dedupKey.slice(SETUP_ERROR_DEDUP_PREFIX.length).split(":", 1)[0];
    return category && category in NOTICE_LABELS ? (category as DashboardSetupErrorCategory) : null;
}

async function fanOutSetupErrorNotification(args: {
    workspaceId: string;
    category: DashboardSetupErrorCategory;
    bucketHour: Date;
    notifications: NotificationsRepository;
    listMemberUserIds: (workspaceId: string) => Promise<readonly string[]>;
}): Promise<void> {
    const userIds = await args.listMemberUserIds(args.workspaceId);
    if (userIds.length === 0) return;
    const label = NOTICE_LABELS[args.category];
    const dedupKey = `setup_error:${args.category}:${args.bucketHour.toISOString()}`;
    await args.notifications.insertIgnore(
        userIds.map((userId) => ({
            workspaceId: args.workspaceId,
            userId,
            source: "setup_error",
            dedupKey,
            severity: "critical",
            title: label.title,
            body: label.body,
            href: buildWorkspacePath(args.workspaceId),
            display: "banner",
        })),
    );
}

export async function recordSetupError(input: RecordSetupErrorInput): Promise<void> {
    try {
        const d = deps();
        await recordSetupErrorUseCase({
            input,
            now: d.now(),
            repo: d.repo,
            notifications: d.notifications,
            listMemberUserIds: d.listMemberUserIds,
        });
    } catch (err) {
        // best-effort; must not poison the request path, but failures need to
        // surface in logs so they're not silently lost.
        console.warn("setup_error.fanout_failed", {
            err: errMessage(err),
        });
    }
}

/**
 * Single observability seam for setup-error reporting. Call sites depend on
 * the interface, not the concrete recorder, so tests can swap in a recording
 * fake via {@link setSetupErrorLoggerForTesting} and production code stays
 * pointed at the persistent rollup.
 */
export interface SetupErrorLogger {
    log(input: RecordSetupErrorInput): Promise<void>;
}

const defaultSetupErrorLogger: SetupErrorLogger = {
    log: recordSetupError,
};

let setupErrorLoggerOverride: SetupErrorLogger | null = null;

export function setSetupErrorLoggerForTesting(logger: SetupErrorLogger | null): void {
    setupErrorLoggerOverride = logger;
}

export function setupErrorLogger(): SetupErrorLogger {
    return setupErrorLoggerOverride ?? defaultSetupErrorLogger;
}

export interface SetupErrorSummary {
    readonly count: number;
    readonly lastSeenAt: Date;
}

export async function summarizeSetupErrorsSince(
    workspaceId: string,
    sinceMs: number,
): Promise<ReadonlyMap<string, SetupErrorSummary>> {
    const d = deps();
    const since = new Date(d.now().getTime() - sinceMs);
    const rows = await d.repo.sumByCategorySince({ workspaceId, since });
    return new Map(
        rows.map((r) => [r.category, { count: r.count, lastSeenAt: r.latestBucketHour }]),
    );
}
