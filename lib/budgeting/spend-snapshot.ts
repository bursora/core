/**
 * Spend snapshot — pure read-side input to `evaluateBudget`.
 *
 * Keyed lookup of USD spend per (scopeType, scopeId, periodFrom). The
 * application-side aggregator builds this map by querying the spend port for
 * each budget row's scope+period.
 *
 * Key shape: `${scopeType}:${scopeId ?? ''}:${periodFrom.toISOString()}`. The
 * empty string for null `scopeId` keeps workspace-wide entries unambiguous.
 *
 * `get(key)` returns 0 for missing entries. evaluateBudget never throws on a
 * missing key — a budget with no recorded spend is simply under by its full
 * amount.
 */

export interface Spend {
    get(key: string): number;
}

export function spendKey(scopeType: string, scopeId: string | null, periodFrom: Date): string {
    return `${scopeType}:${scopeId ?? ""}:${periodFrom.toISOString()}`;
}
