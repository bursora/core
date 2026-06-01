import { resetEnvCacheForTesting } from "@/lib/env";
import { getCheckoutAction, isUserSubscribed } from "@/lib/onboarding/plan-entry";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// The EE boundary guards are the point of this module: off cloud (or in an OSS
// build) it must answer without reaching @/lib/ee, so Lemon Squeezy never lands
// in a self-host bundle. These tests exercise exactly those short-circuits; the
// cloud path delegates to EE billing + isActiveSubscriptionStatus, covered there.

const BASE = {
    DATABASE_URL: "postgres://x",
    BURSORA_API_KEY_PEPPER: "pepper",
    BURSORA_KEY: "x".repeat(43) + "=", // 32 bytes base64
    BETTER_AUTH_SECRET: "secret",
    BETTER_AUTH_URL: "http://localhost:3000",
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    CRON_SECRET: "cron-secret",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
};

const CLOUD = {
    ...BASE,
    IS_CLOUD: "true",
    LEMONSQUEEZY_API_KEY: "ls_test_x",
    LEMONSQUEEZY_WEBHOOK_SECRET: "ls_whsec_x",
    LEMONSQUEEZY_STORE_ID: "store_x",
    BURSORA_RATE_LIMIT_ENABLED: "false",
    BURSORA_SPIKE_PROTECTION_ENABLED: "false",
};

const KEYS = [...Object.keys(CLOUD), "OSS_BUILD"] as const;
const snapshot = new Map<string, string | undefined>();

beforeEach(() => {
    for (const k of KEYS) {
        snapshot.set(k, process.env[k]);
        Reflect.deleteProperty(process.env, k);
    }
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

function applyEnv(vars: Record<string, string>): void {
    for (const [k, v] of Object.entries(vars)) process.env[k] = v;
    resetEnvCacheForTesting();
}

describe("isUserSubscribed", () => {
    test("is false off cloud without reaching EE billing", async () => {
        applyEnv(BASE); // IS_CLOUD unset → self-host
        expect(await isUserSubscribed("user-1")).toBe(false);
    });

    test("is false in an OSS build even on cloud, without reaching EE billing", async () => {
        applyEnv({ ...CLOUD, OSS_BUILD: "true" });
        expect(await isUserSubscribed("user-1")).toBe(false);
    });
});

describe("getCheckoutAction", () => {
    test("throws in an OSS build instead of importing EE billing actions", async () => {
        applyEnv({ OSS_BUILD: "true" });
        await expect(getCheckoutAction()).rejects.toThrow(
            "Cloud billing is unavailable in self-host builds.",
        );
    });
});
