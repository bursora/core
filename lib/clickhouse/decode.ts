/**
 * Decoders for ClickHouse JSON rows. CH serializes `count()` and decimal sums
 * as strings; these normalize them to the shapes the dashboard and PG repos use.
 */

/** Coerce a CH `count()` (JSON string) to a finite non-negative integer; bad input → 0. */
export const safeCount = (n: string | number | bigint | null | undefined): number => {
    if (n === null || n === undefined) return 0;
    const v = typeof n === "number" ? n : Number(n);
    return Number.isFinite(v) && v >= 0 ? Math.trunc(v) : 0;
};

/**
 * Pad a CH decimal's `toString()` to 8 fractional digits. CH drops trailing
 * zeros to the canonical form; this restores the PG `numeric` shape the UI expects.
 */
export const padCost = (s: string): string => {
    if (s.includes(".")) {
        const [whole, frac] = s.split(".");
        return `${whole}.${(frac ?? "").padEnd(8, "0").slice(0, 8)}`;
    }
    return `${s}.00000000`;
};

/** Map CH's empty-string sentinel for an absent tag back to `null`. */
export const tagOrNull = (value: string): string | null => (value === "" ? null : value);
