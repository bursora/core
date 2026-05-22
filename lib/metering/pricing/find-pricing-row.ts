/**
 * findPricingRow — pure helper that picks the pricing row in effect at a
 * specific point in time for a given (provider, model, region) and workspace.
 *
 * Pricing is versioned: when a rate changes, the previous row's
 * `effectiveTo` is set and a new row is inserted. Workspaces may also override
 * the global rate with their own row (workspaceId !== null). The DB exclusion
 * constraint (`pricing_no_overlap`) prevents overlaps within the global scope,
 * but an override row can overlap a global row by design.
 *
 * Selection policy:
 *   1. Filter to candidates matching (provider, model, region) exactly.
 *   2. Filter to rows whose `[effectiveFrom, effectiveTo)` interval contains
 *      `ts`. `effectiveTo === null` is treated as +Infinity.
 *   3. Filter to rows scoped to the caller's workspace OR global (null).
 *   4. Prefer workspace-scoped over global when both apply.
 *   5. Within the chosen scope, pick the row with the most recent
 *      `effectiveFrom` (breaks ties from overlapping ranges deterministically;
 *      rules out timing edge cases when a new row was inserted before the
 *      previous was closed).
 *
 * Returns null when no row applies — the caller (calculate-cost.ts) treats
 * this as a "missing pricing" event and stores cost_usd = 0.
 */

import type { PricingRow } from "./pricing-row";

export interface FindPricingRowInput {
    readonly candidates: readonly PricingRow[];
    readonly provider: string;
    readonly model: string;
    readonly region: string;
    readonly ts: Date;
    readonly workspaceId: string;
}

export function findPricingRow(input: FindPricingRowInput): PricingRow | null {
    const matches = input.candidates.filter(
        (row) =>
            row.provider === input.provider &&
            row.model === input.model &&
            row.region === input.region &&
            isInRange(row, input.ts) &&
            isApplicableScope(row, input.workspaceId),
    );

    if (matches.length === 0) return null;

    const overrides = matches.filter((row) => row.workspaceId === input.workspaceId);
    const pool = overrides.length > 0 ? overrides : matches;

    return mostRecentEffectiveFrom(pool);
}

function isInRange(row: PricingRow, ts: Date): boolean {
    if (ts.getTime() < row.effectiveFrom.getTime()) return false;
    if (row.effectiveTo === null) return true;
    return ts.getTime() < row.effectiveTo.getTime();
}

function isApplicableScope(row: PricingRow, workspaceId: string): boolean {
    return row.workspaceId === null || row.workspaceId === workspaceId;
}

function mostRecentEffectiveFrom(rows: readonly PricingRow[]): PricingRow {
    return rows.reduce((best, current) =>
        current.effectiveFrom.getTime() > best.effectiveFrom.getTime() ? current : best,
    );
}
