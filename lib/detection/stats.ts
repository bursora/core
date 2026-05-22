/**
 * Small statistical helpers shared by the detection pipeline.
 *
 * Empty inputs return 0 so callers can fold without a guard.
 */

export function mean(values: readonly number[]): number {
    if (values.length === 0) return 0;
    let sum = 0;
    for (const v of values) sum += v;
    return sum / values.length;
}

export function median(values: readonly number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    if (sorted.length % 2 === 1) return sorted[mid] as number;
    return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}
