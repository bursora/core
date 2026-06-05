/**
 * Drizzle adapter for durable cron last-run state. One row per job, keyed by
 * name; the scheduler upserts on every run finish and the status page reads the
 * whole set. Survives process restarts so last-run / health don't reset to idle
 * after a deploy (next-run and `running` stay in-memory).
 */

import "server-only";

import type { Db } from "@/lib/db";
import { cronRunState } from "@/lib/db/schema";

export interface CronRunRecord {
    readonly name: string;
    readonly lastRunAt: Date;
    readonly lastOk: boolean;
    readonly lastError: string | null;
    readonly lastDurationMs: number;
}

export async function recordCronRun(db: Db, record: CronRunRecord): Promise<void> {
    await db
        .insert(cronRunState)
        .values(record)
        .onConflictDoUpdate({
            target: cronRunState.name,
            set: {
                lastRunAt: record.lastRunAt,
                lastOk: record.lastOk,
                lastError: record.lastError,
                lastDurationMs: record.lastDurationMs,
            },
        });
}

export async function readCronRunStates(db: Db): Promise<Map<string, CronRunRecord>> {
    const rows = await db.select().from(cronRunState);
    return new Map(rows.map((row) => [row.name, row]));
}
