/**
 * Pure data shaping for the Sparkline component. Lives outside the client
 * file so it can be unit-tested without bringing in recharts or React.
 */

export interface SparklinePoint {
    readonly i: number;
    readonly v: number;
}

export function sparklinePoints(values: readonly number[]): SparklinePoint[] {
    return values.map((v, i) => ({ i, v }));
}
