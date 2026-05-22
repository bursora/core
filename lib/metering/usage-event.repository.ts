/**
 * Port for the usage_events write path. Domain stays free of Drizzle.
 *
 * Exposes a batch insert only. Reads happen in a separate query path
 * (rollups, dashboards) which is its own slice.
 */

import type { UsageEventRow } from "./usage-event";

export interface UsageEventRepository {
    insertBatch(rows: readonly UsageEventRow[]): Promise<void>;
}
