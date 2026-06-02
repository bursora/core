/**
 * ClickHouse-backed `BaselineSource`. Reads the workspace's events/minute
 * series for the last 7 days from `usage_events`. Groups by minute and counts
 * only `status = 'ok'` rows — blocked rows are pre-decision and shouldn't
 * anchor the baseline.
 *
 * Returns a dense array of minute counts (0 for minutes with no events).
 * Length is exactly 7 * 24 * 60 = 10_080. Identical output shape to the
 * Postgres adapter it replaces: same minute boundaries, same dense indexing.
 *
 * Window bounds are passed as epoch ms and reconstructed in-query via
 * `fromUnixTimestamp64Milli`, so the comparison is timezone-independent.
 */

import "server-only";

import type { ClickHouse } from "@/lib/clickhouse/client";
import type { BaselineSource } from "./types";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;
const MINUTES_IN_WINDOW = SEVEN_DAYS_MS / MINUTE_MS;

interface MinuteBucketRow {
    /** Bucket start as epoch ms (Int64 → JSON string). */
    readonly bucketMs: string;
    /** Row count (UInt64 → JSON string). */
    readonly n: string;
}

export function clickHouseBaselineSource(ch: ClickHouse): BaselineSource {
    return {
        async fetch7DayMinuteSeries(input) {
            const endMs = Math.floor(input.endMs / MINUTE_MS) * MINUTE_MS;
            const startMs = endMs - SEVEN_DAYS_MS;

            const rows = await ch.query<MinuteBucketRow>({
                query: `
                    SELECT
                        intDiv(toUnixTimestamp64Milli(ts), {bucketMs:Int64}) * {bucketMs:Int64} AS bucketMs,
                        count() AS n
                    FROM usage_events
                    WHERE workspace_id = toUUID({workspaceId:String})
                        AND status = 'ok'
                        AND ts >= fromUnixTimestamp64Milli({startMs:Int64})
                        AND ts < fromUnixTimestamp64Milli({endMs:Int64})
                    GROUP BY bucketMs
                `,
                query_params: {
                    workspaceId: input.workspaceId,
                    startMs,
                    endMs,
                    bucketMs: MINUTE_MS,
                },
            });

            const series = new Array<number>(MINUTES_IN_WINDOW).fill(0);
            for (const row of rows) {
                const idx = Math.floor((Number(row.bucketMs) - startMs) / MINUTE_MS);
                if (idx >= 0 && idx < series.length) {
                    series[idx] = Number(row.n);
                }
            }
            return series;
        },
    };
}
