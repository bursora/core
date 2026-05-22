/**
 * Spend series source port.
 *
 * Drives the anomaly detector. The orchestrator asks for one workspace's
 * recent spend bucketed by 5 minutes per (tenant, agent) scope. The drizzle
 * adapter aggregates from `usage_events`.
 */

import type { SpendPoint } from "./detect-anomaly";

export interface ScopeKey {
    readonly workspaceId: string;
    readonly tenantId: string | null;
    readonly agentId: string | null;
}

export interface ScopedSpendSeries {
    readonly scope: ScopeKey;
    readonly points: readonly SpendPoint[];
}

export interface SpendSeriesSource {
    /**
     * Returns spend series for every (workspaceId, tenantId, agentId)
     * combination observed in `usage_events` since `since`, bucketed by 5
     * minutes. Buckets without events are NOT filled — the detector treats
     * absent buckets as "no signal" rather than a zero-cost bucket.
     *
     * The orchestrator runs the detector once per returned series.
     */
    listScopedSeries(since: Date): Promise<readonly ScopedSpendSeries[]>;
}
