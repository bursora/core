/**
 * Composition entry point for the daily retention cron.
 *
 * The route handler in `app/api/cron/retention/route.ts` only sees use cases
 * per the ESLint boundary rules — it cannot reach into infrastructure
 * directly. This file wires the concrete drizzle adapter and exposes a single
 * async entry point that returns the prune summary.
 */

import "server-only";

import { db } from "@/lib/db";
import { drizzleRetentionRepository } from "./drizzle-retention.repository";
import { pruneEvents, type PruneSummary } from "./prune-events.usecase";

export async function runRetentionPrune(now: Date = new Date()): Promise<PruneSummary> {
    const repo = drizzleRetentionRepository(db());
    return pruneEvents(repo, now);
}
