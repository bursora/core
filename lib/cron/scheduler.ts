/**
 * In-process cron scheduler.
 *
 * The self-hosted app runs as a long-lived server (`next start` under
 * supervisor), so scheduled work lives here rather than in an external OS
 * cron hitting an HTTP route — the app both decides what runs and runs it.
 * Each job calls its use case directly; because this executes in the server
 * runtime, `server-only` modules import fine and no shared cron secret is
 * needed.
 *
 * Started once from `instrumentation.ts` on the Node.js runtime in
 * production. Add a job by extending `buildJobs`. Patterns are standard cron
 * expressions evaluated in UTC.
 *
 * The live `Cron` objects and the transient `running` flag live in a
 * `globalThis` registry (not module scope) so the status page's bundle and the
 * instrumentation bundle share one instance. Durable last-run outcome is
 * persisted to Postgres (`cron_run_state`) on each run finish, so the admin
 * system-status page's last-run / health survive a process restart — next-run
 * is recomputed from the re-registered crons at boot. `getCronStatus()` merges
 * the two.
 */

import "server-only";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import * as Sentry from "@sentry/nextjs";
import { Cron } from "croner";
import { type CronRunRecord, readCronRunStates, recordCronRun } from "./run-state.repository";

interface ScheduledJob {
    readonly name: string;
    readonly pattern: string;
    readonly run: (now: Date) => Promise<unknown>;
}

/** Live in-process state for one registered job. Durable last-run outcome is
 *  persisted separately (`cron_run_state`); only next-run and the transient
 *  `running` flag are process-local. */
interface CronRegistryEntry {
    readonly name: string;
    readonly pattern: string;
    readonly cron: Cron;
    running: boolean;
}

interface CronRegistry {
    started: boolean;
    readonly entries: CronRegistryEntry[];
}

const GLOBAL_KEY = "__bursora_cron__";

type Globals = typeof globalThis & {
    [GLOBAL_KEY]?: CronRegistry;
};

function registry(): CronRegistry {
    const g = globalThis as Globals;
    g[GLOBAL_KEY] ??= { started: false, entries: [] };
    return g[GLOBAL_KEY];
}

/** Read-only snapshot of one job for the status page. */
export interface CronJobStatus {
    readonly name: string;
    readonly pattern: string;
    readonly nextRunAt: Date | null;
    readonly lastRunAt: Date | null;
    readonly lastOk: boolean | null;
    readonly lastError: string | null;
    readonly lastDurationMs: number | null;
    readonly running: boolean;
}

export interface CronStatus {
    readonly started: boolean;
    readonly jobs: readonly CronJobStatus[];
}

/** Current scheduler health. `started` is false until `startCronScheduler` runs (dev never starts it). */
export async function getCronStatus(): Promise<CronStatus> {
    const reg = registry();
    // Nothing registered (e.g. dev, or before boot): no jobs to enrich, so skip
    // the DB read entirely.
    if (reg.entries.length === 0) return { started: reg.started, jobs: [] };
    // Read durable last-run state, but never let it stall the status page: a DB
    // hiccup (or the table not yet migrated during a deploy) degrades to live
    // next-run / running only, same resilience contract as the service probes.
    // The try wraps `db()` too — it throws synchronously if the pool can't be
    // built — so no failure path escapes to 500 the page.
    let runStates: ReadonlyMap<string, CronRunRecord> = new Map();
    try {
        runStates = await readCronRunStates(db());
    } catch (error: unknown) {
        console.error("cron.run-state.read-failed", error);
        Sentry.captureException(error);
    }
    return {
        started: reg.started,
        jobs: reg.entries.map((entry) => {
            const state = runStates.get(entry.name);
            return {
                name: entry.name,
                pattern: entry.pattern,
                nextRunAt: entry.cron.nextRun(),
                lastRunAt: state?.lastRunAt ?? null,
                lastOk: state?.lastOk ?? null,
                lastError: state?.lastError ?? null,
                lastDurationMs: state?.lastDurationMs ?? null,
                running: entry.running,
            };
        }),
    };
}

async function buildJobs(): Promise<readonly ScheduledJob[]> {
    const { runPricingSync } = await import("@/lib/metering/pricing/run-pricing-sync.usecase");
    const { runAnomalyCron } = await import("@/lib/detection");
    const { runAccountPurgeCron } = await import("@/lib/identity/server");
    const jobs: ScheduledJob[] = [
        { name: "pricing-sync", pattern: "0 4 * * *", run: runPricingSync },
        // Spend anomaly detection across all workspaces, every 5 minutes.
        { name: "anomaly", pattern: "*/5 * * * *", run: runAnomalyCron },
        // Hourly hard-purge of accounts past their 24h deletion grace window.
        { name: "account-purge", pattern: "0 * * * *", run: runAccountPurgeCron },
    ];

    // EE, cloud-only: prune old billing webhook events daily. Dynamic import +
    // OSS_BUILD guard keep it out of the OSS bundle (same pattern as the EE
    // route/page call-sites); the IS_CLOUD check skips it on self-host.
    if (process.env.OSS_BUILD !== "true" && env().IS_CLOUD) {
        const { runBillingWebhookPrune } = await import("@/lib/ee/billing/server");
        jobs.push({
            name: "billing-webhook-prune",
            pattern: "0 3 * * *",
            run: runBillingWebhookPrune,
        });
    }

    return jobs;
}

export async function startCronScheduler(): Promise<void> {
    const reg = registry();
    if (reg.started) return;
    reg.started = true;

    const jobs = await buildJobs();
    for (const job of jobs) {
        const cron = new Cron(
            job.pattern,
            {
                name: job.name,
                timezone: "UTC",
                // Skip a run if the previous one is still going.
                protect: true,
                catch: (error: unknown) => {
                    console.error(`cron.${job.name}.error`, error);
                    Sentry.captureException(error);
                },
            },
            async () => {
                const entry = reg.entries.find((candidate) => candidate.name === job.name);
                const startedAtMs = Date.now();
                if (entry) entry.running = true;
                let ok = true;
                let errorMessage: string | null = null;
                try {
                    const summary = await job.run(new Date());
                    console.info(`cron.${job.name}.summary`, summary);
                } catch (error: unknown) {
                    ok = false;
                    errorMessage = error instanceof Error ? error.message : String(error);
                    // Re-throw so croner's `catch` logs + reports to Sentry.
                    throw error;
                } finally {
                    if (entry) entry.running = false;
                    // Best-effort: a persistence failure must never mask the job
                    // error rethrown above, so it's swallowed to Sentry here.
                    try {
                        await recordCronRun(db(), {
                            name: job.name,
                            lastRunAt: new Date(startedAtMs),
                            lastOk: ok,
                            lastError: errorMessage,
                            lastDurationMs: Date.now() - startedAtMs,
                        });
                    } catch (persistError: unknown) {
                        console.error(`cron.${job.name}.persist-failed`, persistError);
                        Sentry.captureException(persistError);
                    }
                }
            },
        );
        reg.entries.push({
            name: job.name,
            pattern: job.pattern,
            cron,
            running: false,
        });
    }

    console.info(`cron scheduler started: ${jobs.map((j) => j.name).join(", ")}`);
}
