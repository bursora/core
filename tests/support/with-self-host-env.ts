/**
 * Test helper: register self-host-mode env around every test in the calling
 * file. The self-host counterpart to `installCloudEnv` (./with-cloud-env.ts).
 *
 * Why this exists: `env()` memoizes `process.env` on first call and never
 * resets on its own. Self-host suites that import server modules (the events
 * route, EE billing components) trigger an eager `env()` somewhere in their
 * import chain. Without a baseline they throw `Missing required env vars`, and
 * an ambient `IS_CLOUD=true` (local `.env`) flips them into a cloud path they
 * never intended. This helper snapshots the relevant keys in `beforeEach`,
 * installs a complete self-host env + drops the cache, and in `afterEach`
 * restores the snapshot + drops the cache again.
 *
 * Call it once at the top level of a test file. It registers its own
 * `beforeEach`/`afterEach`; no extra wiring is needed.
 */

import { resetEnvCacheForTesting } from "@/lib/env";
import { afterEach, beforeEach } from "bun:test";

/** Every env key the self-host baseline touches. */
const KEYS = [
    "IS_CLOUD",
    "LEMONSQUEEZY_API_KEY",
    "LEMONSQUEEZY_WEBHOOK_SECRET",
    "LEMONSQUEEZY_STORE_ID",
    "BURSORA_RATE_LIMIT_ENABLED",
    "BURSORA_SPIKE_PROTECTION_ENABLED",
    "REDIS_URL",
    "CRON_SECRET",
    "DATABASE_URL",
    "BURSORA_API_KEY_PEPPER",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "SMTP_HOST",
    "SMTP_PORT",
    "NEXT_PUBLIC_APP_URL",
] as const;

/**
 * Default self-host env. The always-required vars are present; `IS_CLOUD` and
 * the request-cap flags are off, so the LS quartet is not required. `REDIS_URL`
 * is always required (the spend counter needs Redis on every path), so the
 * baseline supplies it. Keys set to `undefined` are deleted from `process.env`
 * (clearing any ambient cloud values from a local `.env`).
 */
const SELF_HOST_ENV: Readonly<Record<(typeof KEYS)[number], string | undefined>> = {
    IS_CLOUD: undefined,
    LEMONSQUEEZY_API_KEY: undefined,
    LEMONSQUEEZY_WEBHOOK_SECRET: undefined,
    LEMONSQUEEZY_STORE_ID: undefined,
    BURSORA_RATE_LIMIT_ENABLED: "false",
    BURSORA_SPIKE_PROTECTION_ENABLED: "false",
    REDIS_URL: "redis://localhost:6379",
    CRON_SECRET: "test-cron",
    DATABASE_URL: "postgres://test",
    BURSORA_API_KEY_PEPPER: "test-pepper",
    BETTER_AUTH_SECRET: "test-secret",
    BETTER_AUTH_URL: "https://app.test",
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    NEXT_PUBLIC_APP_URL: "https://app.test",
};

/**
 * Wrap every test in the calling file in a self-host env. Snapshots and
 * restores the keys it touches so nothing leaks into later tests in the same
 * in-process run.
 */
export function installSelfHostEnv(): void {
    const snapshot = new Map<string, string | undefined>();

    beforeEach(() => {
        snapshot.clear();
        for (const k of KEYS) {
            snapshot.set(k, process.env[k]);
            const value = SELF_HOST_ENV[k];
            if (value === undefined) Reflect.deleteProperty(process.env, k);
            else process.env[k] = value;
        }
        resetEnvCacheForTesting();
    });

    afterEach(() => {
        for (const k of KEYS) {
            const prior = snapshot.get(k);
            if (prior === undefined) Reflect.deleteProperty(process.env, k);
            else process.env[k] = prior;
        }
        snapshot.clear();
        resetEnvCacheForTesting();
    });
}
