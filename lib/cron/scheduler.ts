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
 * Each run's outcome is recorded in a `globalThis` registry so the admin
 * system-status page can read last-run / next-run / health via
 * `getCronStatus()`. The registry lives on `globalThis` (not module scope)
 * so the page's bundle and the instrumentation bundle share one instance.
 */

import "server-only";

import { env } from "@/lib/env";
import * as Sentry from "@sentry/nextjs";
import { Cron } from "croner";

interface ScheduledJob {
    readonly name: string;
    readonly pattern: string;
    readonly run: (now: Date) => Promise<unknown>;
}

/** Mutable live state for one registered job, updated on every run. */
interface CronRegistryEntry {
    readonly name: string;
    readonly pattern: string;
    readonly cron: Cron;
    lastRunAt: Date | null;
    lastOk: boolean | null;
    lastError: string | null;
    lastDurationMs: number | null;
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
export function getCronStatus(): CronStatus {
    const reg = registry();
    return {
        started: reg.started,
        jobs: reg.entries.map((entry) => ({
            name: entry.name,
            pattern: entry.pattern,
            nextRunAt: entry.cron.nextRun(),
            lastRunAt: entry.lastRunAt,
            lastOk: entry.lastOk,
            lastError: entry.lastError,
            lastDurationMs: entry.lastDurationMs,
            running: entry.running,
        })),
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
                try {
                    const summary = await job.run(new Date());
                    console.info(`cron.${job.name}.summary`, summary);
                    if (entry) {
                        entry.lastOk = true;
                        entry.lastError = null;
                    }
                } catch (error: unknown) {
                    if (entry) {
                        entry.lastOk = false;
                        entry.lastError = error instanceof Error ? error.message : String(error);
                    }
                    // Re-throw so croner's `catch` logs + reports to Sentry.
                    throw error;
                } finally {
                    if (entry) {
                        entry.lastRunAt = new Date(startedAtMs);
                        entry.lastDurationMs = Date.now() - startedAtMs;
                        entry.running = false;
                    }
                }
            },
        );
        reg.entries.push({
            name: job.name,
            pattern: job.pattern,
            cron,
            lastRunAt: null,
            lastOk: null,
            lastError: null,
            lastDurationMs: null,
            running: false,
        });
    }

    console.info(`cron scheduler started: ${jobs.map((j) => j.name).join(", ")}`);
}
