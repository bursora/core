/**
 * Event-bundle recording for the events ingest path.
 *
 * `recordEventBundleUsage` runs after a successful DB write. It bumps the
 * Redis counter by the batch size and, when the per-workspace batching
 * threshold is crossed, persists the rollup to the cold store. The hot path
 * stays synchronous because the dashboard fair-use banner reads the counter
 * directly.
 *
 * The 5M events/month bundle is a fair-use cap, not a hard block: ingest
 * always proceeds. Past the bundle the dashboard warns and the operator
 * reaches out. See `counter.ts` for why a billing limit never blocks spend
 * protection.
 *
 * Cold-store cadence: the Redis counter is authoritative; the Postgres
 * rollup only backs cache loss. We batch writes so the cold store sees an
 * upsert at most every `COLD_WRITE_INTERVAL_MS` or every
 * `COLD_WRITE_BATCH_EVENTS` events per workspace — whichever comes first.
 *
 * Self-host (`IS_CLOUD=false`): no-ops via the `enabled` flag.
 */

import "server-only";

import { LruCache } from "../lru-cache";
import { monthKey } from "./counter";
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
