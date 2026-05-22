/**
 * Retention repository port.
 *
 * Drives the prune-events use case. Two write paths:
 *   1. Row-level deletes (`deleteEventsOlderThan`) per workspace, scoped to
 *      the cloud retention window.
 *   2. Whole-partition drops (`dropPartition`) when an entire monthly
 *      partition is past the retention window AND empty.
 *
 * Concrete adapters live in metering/infrastructure.
 */

export interface WorkspaceRetention {
    readonly workspaceId: string;
}

export interface PartitionInfo {
    readonly partitionName: string;
    readonly lowerBound: Date;
    readonly upperBound: Date;
}

export interface RetentionRepository {
    /**
     * Lists all workspaces eligible for pruning.
     */
    listWorkspaces(): Promise<readonly WorkspaceRetention[]>;

    /**
     * Deletes events for a single workspace whose `ts` is strictly older than
     * `cutoffDate`. Returns the number of rows removed.
     */
    deleteEventsOlderThan(workspaceId: string, cutoffDate: Date): Promise<number>;

    /**
     * Lists `usage_events_YYYY_MM` partitions whose `upperBound` is at or before
     * `cutoffDate` — i.e. partitions whose entire range is past retention.
     */
    listPartitionsOlderThan(cutoffDate: Date): Promise<readonly PartitionInfo[]>;

    /**
     * Counts rows currently in a single partition. Used to decide whether the
     * partition is safe to drop (empty) or has stragglers (mixed).
     */
    countRowsInPartition(partitionName: string): Promise<number>;

    /**
     * Detaches and drops the given partition in a single transaction. The
     * adapter MUST validate `partitionName` against a strict regex before
     * issuing dynamic SQL.
     */
    dropPartition(partitionName: string): Promise<void>;
}
