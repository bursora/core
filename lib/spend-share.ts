/**
 * Pure helper for the Top Spenders table. Given a row's `costUsd` and the
 * range total, return an integer percent in [0, 100] used to size the
 * share-of-total background bar. Invalid or non-finite inputs degrade to 0.
 */

export function computeSharePercent(value: string, total: string): number {
    const v = Number.parseFloat(value);
    const t = Number.parseFloat(total);
    if (!Number.isFinite(v) || !Number.isFinite(t) || t <= 0) return 0;
    if (v <= 0) return 0;
    const pct = (v / t) * 100;
    if (pct >= 100) return 100;
    return Math.round(pct);
}
