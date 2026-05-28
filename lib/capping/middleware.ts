/**
 * Unified capping middleware for the events ingest path.
 *
 * Composes two upstream checks into a single decision:
 *   1. Spike protection: burst against the per-workspace 7-day baseline.
 *   2. Event-bundle hard cap: monthly overage cap in USD cents.
 *
 * The legacy split sequenced the two checks in the route. Swapping the
 * order would let a real burst leak through, because the bundle isn't
 * yet over its cap when traffic first ramps. This module collapses the
 * two into one call so the route can't reorder them by accident.
 */

import "server-only";

export interface CappingDecision {
    readonly allowed: boolean;
    /** Suggested wait before retrying. Only set for spike denials. */
    readonly retryAfterMs?: number;
    /** Which upstream check denied the request. Absent when allowed. */
    readonly reason?: "spike" | "bundle";
}

export type CapCheck = (workspaceId: string, eventCount: number) => Promise<CappingDecision>;

export interface CappingMiddleware {
    apply(workspaceId: string, eventCount: number): Promise<CappingDecision>;
}

export interface CappingMiddlewareDeps {
    readonly spike: CapCheck;
    readonly bundle: CapCheck;
}

export function createCappingMiddleware(deps: CappingMiddlewareDeps): CappingMiddleware {
    return {
        async apply(workspaceId, eventCount) {
            // Why: spike runs FIRST as the safety ramp against burst traffic
            // against a 7-day baseline. Bundle is a capacity cap that only
            // matters once a workspace has accrued real usage in the current
            // cycle. If we checked bundle first, a brand-new workspace under
            // its bundle would be allowed to burst unchecked; the spike guard
            // would never run. Short-circuit on spike denial to avoid hitting
            // the bundle's Redis read for an already-rejected call.
            const spike = await deps.spike(workspaceId, eventCount);
            if (!spike.allowed) return spike;
            return deps.bundle(workspaceId, eventCount);
        },
    };
}
