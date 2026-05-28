/**
 * Test helper: register cloud-mode env around every test in the calling file.
 *
 * Why this exists: `env()` memoizes `process.env` on first call and never
 * resets on its own. Cloud-mode tests used to mutate `process.env` at module
 * load (top-level `process.env.IS_CLOUD = "true"`), which leaked into every
 * later in-process test — self-host-expecting suites (rate-limit, spike,
 * redis) then saw cloud and broke. This helper snapshots the relevant keys
 * in `beforeEach`, installs a complete cloud env + drops the cache, and in
 * `afterEach` restores the snapshot + drops the cache again.
 *
 * Call it once at the top level of a test file. It registers its own
 * `beforeEach`/`afterEach`; no extra wiring is needed.
 */

import { resetEnvCacheForTesting } from "@/lib/env";
import { afterEach, beforeEach } from "bun:test";

/** Every env key the cloud test boot used to touch. */
const KEYS = [
    "IS_CLOUD",
    "LEMONSQUEEZY_API_KEY",
    "LEMONSQUEEZY_WEBHOOK_SECRET",
    "LEMONSQUEEZY_STORE_ID",
    "LEMONSQUEEZY_VARIANT_ID",
    "BURSORA_RATE_LIMIT_ENABLED",
    "BURSORA_SPIKE_PROTECTION_ENABLED",
    "CRON_SECRET",
    "DATABASE_URL",
    "BURSORA_API_KEY_PEPPER",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "SMTP_HOST",
    "SMTP_PORT",
    "NEXT_PUBLIC_APP_URL",
] as const;

/** Default cloud-mode env. Request-cap flags off so REDIS_URL is not required. */
const CLOUD_ENV: Readonly<Record<(typeof KEYS)[number], string>> = {
    IS_CLOUD: "true",
    LEMONSQUEEZY_API_KEY: "ls_test_api_key",
    LEMONSQUEEZY_WEBHOOK_SECRET: "ls_test_webhook_secret",
    LEMONSQUEEZY_STORE_ID: "1",
    LEMONSQUEEZY_VARIANT_ID: "variant_team",
    BURSORA_RATE_LIMIT_ENABLED: "false",
    BURSORA_SPIKE_PROTECTION_ENABLED: "false",
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
 * Wrap every test in the calling file in a cloud-mode env. Snapshots and
 * restores the keys it touches so nothing leaks into later tests in the same
 * in-process run.
 */
export function installCloudEnv(): void {
    const snapshot = new Map<string, string | undefined>();

    beforeEach(() => {
        snapshot.clear();
        for (const k of KEYS) {
            snapshot.set(k, process.env[k]);
            process.env[k] = CLOUD_ENV[k];
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
