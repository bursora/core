/**
 * System health collection for the admin status page. Each backing service is
 * probed with a live, timeout-guarded call so one hung datastore never stalls
 * the render. Read-only: no check mutates state.
 *
 * Probe failures render a coarse reason (never the raw driver string, which can
 * carry host / port / credentials); the full error is logged server-side.
 */

import "server-only";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { getCronStatus } from "@/lib/cron/scheduler";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { defaultSmtpMailer } from "@/lib/notification";
import { redisClient } from "@/lib/redis/client";
import * as Sentry from "@sentry/nextjs";
import { sql } from "drizzle-orm";
import type { RuntimeInfo, ServiceHealth, SystemHealth } from "./types";

const CHECK_TIMEOUT_MS = 5_000;
const GOOGLE_OIDC_PROBE_URL = "https://accounts.google.com/.well-known/openid-configuration";

/**
 * Map a probe failure to a coarse, non-sensitive reason for display. Raw driver
 * errors embed internal host / port / user (e.g. `ECONNREFUSED 10.0.0.5:6379`),
 * so the full error is logged server-side and only this category is rendered.
 */
export function probeFailureReason(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (/ECONNREFUSED/i.test(message)) return "Unreachable (connection refused)";
    if (/ETIMEDOUT|timed out|AbortError|timeout/i.test(message)) return "Timed out";
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) return "DNS resolution failed";
    if (/ECONNRESET|EPIPE/i.test(message)) return "Connection reset";
    if (/\b(401|403|535)\b|unauthor|invalid login|authentication/i.test(message)) {
        return "Authentication failed";
    }
    return "Unavailable";
}

/**
 * Race a probe against a timeout. `Promise.race` keeps a reaction on the probe,
 * so a late rejection after the timeout wins is still observed (no unhandled
 * rejection). Outbound fetches additionally pass `AbortSignal.timeout` so the
 * socket is freed rather than left in flight.
 */
export function withTimeout<T>(
    promise: Promise<T>,
    label: string,
    ms = CHECK_TIMEOUT_MS,
): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise.finally(() => clearTimeout(timer)), timeout]);
}

async function timedCheck(
    key: string,
    label: string,
    probe: () => Promise<unknown>,
): Promise<ServiceHealth> {
    const startedAt = Date.now();
    try {
        await withTimeout(probe(), label);
        return { key, label, status: "ok", latencyMs: Date.now() - startedAt };
    } catch (error: unknown) {
        console.error(`system-health.${key}.down`, error);
        return {
            key,
            label,
            status: "down",
            latencyMs: Date.now() - startedAt,
            error: probeFailureReason(error),
        };
    }
}

/** Reachability of Google's OAuth identity provider, one of the two sign-in paths. */
async function googleOAuthProbe(): Promise<void> {
    const response = await fetch(GOOGLE_OIDC_PROBE_URL, {
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

/**
 * Sentry health from the in-process SDK, not just env. `isInitialized()` is
 * true only if `Sentry.init` actually ran with a client in this runtime, so it
 * catches a DSN that's set but never initialized (the env var alone can't).
 */
export function sentryHealth(): ServiceHealth {
    const label = "Sentry";
    const dsnConfigured = (process.env.SENTRY_DSN ?? "").length > 0;
    if (!dsnConfigured)
        return { key: "sentry", label, status: "disabled", detail: "Not configured" };
    return Sentry.isInitialized()
        ? { key: "sentry", label, status: "ok", detail: "Error tracking active" }
        : { key: "sentry", label, status: "down", error: "DSN set but SDK not initialized" };
}

/**
 * Billing is cloud-only. Reuse the EE provider's credential probe (the same
 * cheap authenticated read it runs at boot) through the allowlisted
 * dynamic-import seam, so the Lemon Squeezy wire details stay in the EE module
 * and out of OSS builds.
 */
async function billingHealth(): Promise<ServiceHealth> {
    const label = "Billing (Lemon Squeezy)";
    if (process.env.OSS_BUILD === "true" || !env().IS_CLOUD) {
        return { key: "billing", label, status: "disabled", detail: "Self-host" };
    }
    const startedAt = Date.now();
    try {
        const { billingDeps } = await import("@/lib/ee/billing/server");
        const result = await withTimeout(billingDeps().provider.verifyCredentials(), label);
        const latencyMs = Date.now() - startedAt;
        return result.ok
            ? {
                  key: "billing",
                  label,
                  status: "ok",
                  latencyMs,
                  detail: `Mode: ${env().LEMONSQUEEZY_MODE}`,
              }
            : { key: "billing", label, status: "down", latencyMs, error: "API key rejected" };
    } catch (error: unknown) {
        console.error("system-health.billing.down", error);
        return {
            key: "billing",
            label,
            status: "down",
            latencyMs: Date.now() - startedAt,
            error: probeFailureReason(error),
        };
    }
}

function runtimeInfo(): RuntimeInfo {
    const memory = process.memoryUsage();
    return {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssBytes: memory.rss,
        memoryHeapUsedBytes: memory.heapUsed,
        nodeVersion: process.version,
        nodeEnv: process.env.NODE_ENV ?? "development",
        mode: env().IS_CLOUD ? "Cloud" : "Self-host",
    };
}

export async function collectSystemHealth(): Promise<SystemHealth> {
    const [services, cron] = await Promise.all([
        Promise.all([
            timedCheck("postgres", "Postgres", () => db().execute(sql`select 1`)),
            timedCheck("clickhouse", "ClickHouse", () => clickhouseClient().ping()),
            timedCheck("redis", "Redis", () => redisClient(env().REDIS_URL).ping()),
            timedCheck("smtp", "SMTP", () => defaultSmtpMailer().verify()),
            timedCheck("google", "Google OAuth", googleOAuthProbe),
            Promise.resolve(sentryHealth()),
            billingHealth(),
        ]),
        getCronStatus(),
    ]);
    return {
        runtime: runtimeInfo(),
        services,
        cron,
        checkedAt: new Date(),
    };
}
