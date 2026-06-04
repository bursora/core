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

let started = false;

export async function startCronScheduler(): Promise<void> {
    if (started) return;
    started = true;

    const jobs = await buildJobs();
    for (const job of jobs) {
        new Cron(
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
                const summary = await job.run(new Date());
                console.info(`cron.${job.name}.summary`, summary);
            },
        );
    }

    console.info(`cron scheduler started: ${jobs.map((j) => j.name).join(", ")}`);
}
