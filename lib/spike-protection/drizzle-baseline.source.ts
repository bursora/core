/**
 * Drizzle-backed `BaselineSource`. Reads the workspace's events/minute
 * series for the last 7 days from `usage_events`. To keep the query cheap,
 * we group by minute (`date_trunc('minute', ts)`) and only count `status =
 * 'ok'` rows — blocked rows are pre-decision and shouldn't anchor the
 * baseline.
 *
 * Returns a dense array of minute counts (0 for minutes with no events).
 * Length is exactly 7 * 24 * 60 = 10_080.
 */

import "server-only";

import { schema, type Db } from "@/lib/db";
import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import type { BaselineSource } from "./types";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;
const MINUTES_IN_WINDOW = SEVEN_DAYS_MS / MINUTE_MS;

export function drizzleBaselineSource(db: Db): BaselineSource {
    return {
        async fetch7DayMinuteSeries(input) {
            const endMs = Math.floor(input.endMs / MINUTE_MS) * MINUTE_MS;
            const startMs = endMs - SEVEN_DAYS_MS;
            const start = new Date(startMs);
            const end = new Date(endMs);

            const rows = await db
                .select({
                    bucket: sql<Date>`date_trunc('minute', ${schema.usageEvents.ts})`,
                    n: count(),
                })
                .from(schema.usageEvents)
                .where(
                    and(
                        eq(schema.usageEvents.workspaceId, input.workspaceId),
                        eq(schema.usageEvents.status, "ok"),
                        gte(schema.usageEvents.ts, start),
                        lt(schema.usageEvents.ts, end),
                    ),
                )
                .groupBy(sql`date_trunc('minute', ${schema.usageEvents.ts})`);

            const series = new Array<number>(MINUTES_IN_WINDOW).fill(0);
            for (const r of rows) {
                const bucketMs = new Date(r.bucket).getTime();
                const idx = Math.floor((bucketMs - startMs) / MINUTE_MS);
                if (idx >= 0 && idx < series.length) {
                    series[idx] = Number(r.n);
                }
            }
            return series;
        },
    };
}
