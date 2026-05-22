/**
 * Event-bundle middleware for the events ingest path. Two halves:
 *
 *   1. `checkEventBundleHardCap` runs after rate-limit and spike-protection
 *      but before the DB write. If the workspace has a hard cap configured
 *      and accepting the batch would push accrued overage past it, returns
 *      a 202 response carrying `X-Bursora-Cap-Hit: events`. Event is NOT
 *      recorded.
 *
 *   2. `recordEventBundleUsage` runs after a successful DB write. It bumps
 *      the Redis counter by the batch size and, when the per-workspace
 *      batching threshold is crossed, persists the rollup to the cold
 *      store. The hot path stays synchronous because the dashboard banner
 *      reads the counter directly.
 *
 * Cold-store cadence: the Redis counter is authoritative; the Postgres
 * rollup only matters for billing reconciliation. We batch writes so the
 * cold store sees an upsert at most every `COLD_WRITE_INTERVAL_MS` or
 * every `COLD_WRITE_BATCH_EVENTS` events per workspace — whichever comes
 * first.
 *
 * Self-host (`IS_CLOUD=false`): both halves no-op via the `enabled` flag.
 */

import "server-only";

import { NextResponse } from "next/server";
import { LruCache } from "../lru-cache";
import { monthKey, overageCentsAt, wouldExceedHardCap } from "./counter";
import { eventBundleDeps } from "./server";

const COLD_WRITE_INTERVAL_MS = 60_000;
const COLD_WRITE_BATCH_EVENTS = 1_000;
const COLD_WRITE_TRACKER_MAX = 10_000;

interface ColdWriteState {
    readonly lastWrittenCount: number;
}

const lastColdWrite = new LruCache<string, ColdWriteState>(COLD_WRITE_TRACKER_MAX);

/** Clear the cold-write tracker. Test-only. */
export function resetEventBundleColdWriteTracker(): void {
    lastColdWrite.clear();
}

export interface EventBundleHardCapOutcome {
    /** 202 response with the cap header set, or `null` when allowed. */
    readonly response: NextResponse | null;
}

export async function checkEventBundleHardCap(input: {
    readonly workspaceId: string;
    readonly eventCount: number;
}): Promise<EventBundleHardCapOutcome> {
    const deps = eventBundleDeps();
    if (!deps.enabled) return { response: null };

    const month = monthKey(deps.now());
    const [settings, priorCount] = await Promise.all([
        deps.settings.findByWorkspaceId(input.workspaceId),
        deps.counter.readMonth({ workspaceId: input.workspaceId, month }),
    ]);
    const hardCapUsdCents = settings?.hardCapUsdCents ?? null;
    if (hardCapUsdCents === null) return { response: null };

    if (
        wouldExceedHardCap({
            priorCount,
            nextEventCount: input.eventCount,
            hardCapUsdCents,
        })
    ) {
        return { response: cappedResponse(hardCapUsdCents) };
    }

    return { response: null };
}

export async function recordEventBundleUsage(input: {
    readonly workspaceId: string;
    readonly eventCount: number;
}): Promise<void> {
    const deps = eventBundleDeps();
    if (!deps.enabled) return;
    if (input.eventCount <= 0) return;

    const month = monthKey(deps.now());
    const { newCount } = await deps.counter.incrementMonth({
        workspaceId: input.workspaceId,
        month,
        n: input.eventCount,
    });

    // Cold-store rollup. The Redis counter is authoritative; we only flush
    // to Postgres every COLD_WRITE_INTERVAL_MS or every COLD_WRITE_BATCH_EVENTS
    // events to keep the hot path cheap. The repository's setWhere guards
    // against an older write overwriting a fresher row.
    const trackerKey = `${input.workspaceId}:${month}`;
    if (!shouldFlushCold({ trackerKey, newCount, nowMs: deps.now().getTime() })) return;

    await deps.usage.upsertMonth({
        workspaceId: input.workspaceId,
        month,
        eventsCount: newCount,
        overageCents: overageCentsAt(newCount),
    });
    lastColdWrite.set(trackerKey, { lastWrittenCount: newCount }, deps.now().getTime());
}

function shouldFlushCold(args: {
    readonly trackerKey: string;
    readonly newCount: number;
    readonly nowMs: number;
}): boolean {
    const entry = lastColdWrite.get(args.trackerKey);
    if (entry === undefined) return true;
    if (args.nowMs - entry.storedAtMs >= COLD_WRITE_INTERVAL_MS) return true;
    if (args.newCount - entry.value.lastWrittenCount >= COLD_WRITE_BATCH_EVENTS) return true;
    return false;
}

function cappedResponse(hardCapUsdCents: number): NextResponse {
    const limitUsd = hardCapUsdCents / 100;
    const response = NextResponse.json(
        { status: "events_capped", limit_usd: limitUsd },
        { status: 202 },
    );
    response.headers.set("X-Bursora-Cap-Hit", "events");
    return response;
}
