/**
 * Port for the usage_events write path. Domain stays free of Drizzle.
 *
 * Exposes a batch insert only. Reads happen in a separate query path
 * (rollups, dashboards) which is its own slice.
 */

import type { UsageEventRow } from "./usage-event";

export interface UsageEventRepository {
    /**
     * Persists the batch and returns the number of rows written. This is a
     * plain sink: every row given is written. Idempotency lives upstream in the
     * ingest use-case, which drops retried `requestId`s via the Redis dedup
     * guard before they reach here, so the caller bills the bundle by this
     * count, never the input length (issue #1002).
     */
    insertBatch(rows: readonly UsageEventRow[]): Promise<number>;

    /**
     * Erases every usage event for the given workspaces (GDPR account purge).
     * No-op on an empty list. Issues a ClickHouse `ALTER TABLE ... DELETE`
     * mutation, so the rows are removed asynchronously by ClickHouse.
     */
    eraseByWorkspaces(workspaceIds: readonly string[]): Promise<void>;
}
