/**
 * Read-side types for the spend dashboards.
 *
 * The metering write path is in `usage-event.ts`. These types are aggregations
 * derived from `usage_events` — one entry per (bucket, facet value).
 *
 * Cost is a string to preserve the `numeric(14,8)` precision end-to-end.
 */

export type Facet = "tenant" | "agent" | "workflow" | "model";

/** Half-open window the spend view operates on: `[from, to)` in UTC. */
export interface SpendWindow {
    readonly from: Date;
    readonly to: Date;
}

/**
 * Literal placeholder for events whose facet value is null. Customers see
 * this in the UI and can grep their code for call sites missing the tag.
 */
export const UNTAGGED = "(untagged)" as const;

export interface SeriesPoint {
    /** UTC start of the bucket. */
    readonly bucket: Date;
    /** The facet value, or `(untagged)` when null. */
    readonly tag: string;
    /** Sum of cost_usd in this bucket+tag, as a fixed-precision string. */
    readonly costUsd: string;
    /** Number of usage events in this bucket+tag. Zero for zero-fill rows. */
    readonly callCount: number;
}

export interface FacetedSeries {
    readonly facet: Facet;
    readonly from: Date;
    readonly to: Date;
    readonly points: readonly SeriesPoint[];
    /** Total spend across all points, as a fixed-precision string. */
    readonly totalUsd: string;
    /** Total call count across raw (pre zero-fill) points. */
    readonly totalCalls: number;
    /** Bucket size in seconds, derived from the window span. */
    readonly bucketSeconds: number;
}
