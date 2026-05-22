/**
 * Prune events use case.
 *
 * Drops `usage_events` rows older than the cloud retention window (90 days).
 *
 * Strategy:
 *   1. Per-workspace row delete using the shared cutoff. Cheap on
 *      partitioned tables because Postgres prunes partitions automatically
 *      when the WHERE clause fits the partition key.
 *   2. After per-workspace deletes settle, list monthly partitions whose
 *      whole range is past the retention window. Drop the empty ones;
 *      leave non-empty ones for the next run.
 */

import { CLOUD_RETENTION_DAYS } from "./retention-policy";
import type { RetentionRepository } from "./retention.repository";

export interface PerWorkspaceSummary {
    readonly workspaceId: string;
    readonly rowsPruned: number;
}

export interface PruneSummary {
    readonly rowsPruned: number;
    readonly partitionsDropped: number;
    readonly perWorkspace: readonly PerWorkspaceSummary[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function pruneEvents(repo: RetentionRepository, now: Date): Promise<PruneSummary> {
    const workspaces = await repo.listWorkspaces();
    const cutoff = new Date(now.getTime() - CLOUD_RETENTION_DAYS * DAY_MS);

    const perWorkspace: PerWorkspaceSummary[] = [];
    let rowsPruned = 0;

    for (const ws of workspaces) {
        const removed = await repo.deleteEventsOlderThan(ws.workspaceId, cutoff);
        rowsPruned += removed;
        perWorkspace.push({ workspaceId: ws.workspaceId, rowsPruned: removed });
    }

    const candidates = await repo.listPartitionsOlderThan(cutoff);

    let partitionsDropped = 0;
    for (const part of candidates) {
        const rows = await repo.countRowsInPartition(part.partitionName);
        if (rows === 0) {
            await repo.dropPartition(part.partitionName);
            partitionsDropped += 1;
        }
    }

    return {
        rowsPruned,
        partitionsDropped,
        perWorkspace,
    };
}
