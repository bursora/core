/**
 * Port for the usage_events write path. Domain stays free of Drizzle.
 *
 * Exposes a batch insert only. Reads happen in a separate query path
 * (rollups, dashboards) which is its own slice.
 */

import type { UsageEventRow } from "./usage-event";

export interface UsageEventRepository {
    /**
     * Persists the batch and returns the number of rows actually written.
     * Rows that collide on the partial unique index `(workspace_id,
     * request_id)` are dropped (ON CONFLICT DO NOTHING) and excluded from the
     * count, so a retried `requestId` reports 0. The caller bills the bundle
     * by this count, never the input length, or retries would over-count
     * (issue #1002).
     */
    insertBatch(rows: readonly UsageEventRow[]): Promise<number>;
}
