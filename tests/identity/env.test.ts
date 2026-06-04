import { env, loadEnv, resetEnvCacheForTesting } from "@/lib/env";
import { afterEach, describe, expect, test } from "bun:test";

const BASE = {
    DATABASE_URL: "postgres://x",
    BURSORA_API_KEY_PEPPER: "pepper",
    BURSORA_KEY: "x".repeat(43) + "=", // 32 bytes base64
    BETTER_AUTH_SECRET: "secret",
    BETTER_AUTH_URL: "http://localhost:3000",
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
    REDIS_URL: "redis://localhost:6379",
    CLICKHOUSE_URL: "http://localhost:8123",
};

const FULL_CLOUD = {
    ...BASE,
    IS_CLOUD: "true",
    LEMONSQUEEZY_API_KEY: "ls_test_x",
    LEMONSQUEEZY_WEBHOOK_SECRET: "ls_whsec_x",
    LEMONSQUEEZY_STORE_ID: "store_x",
};

describe("loadEnv", () => {
    test("returns a frozen object when all required vars are set (cloud mode)", () => {
        const env = loadEnv(FULL_CLOUD);

        expect(env.DATABASE_URL).toBe("postgres://x");
        expect(env.SMTP_PORT).toBe(1025);
        expect(env.IS_CLOUD).toBe(true);
        expect(env.LEMONSQUEEZY_API_KEY).toBe("ls_test_x");
        expect(env.LEMONSQUEEZY_WEBHOOK_SECRET).toBe("ls_whsec_x");
        expect(env.LEMONSQUEEZY_STORE_ID).toBe("store_x");
    });

    test("OSS mode does not require Lemon Squeezy vars and exposes empty strings", () => {
        const env = loadEnv(BASE);

        expect(env.IS_CLOUD).toBe(false);
        expect(env.LEMONSQUEEZY_API_KEY).toBe("");
        expect(env.LEMONSQUEEZY_WEBHOOK_SECRET).toBe("");
        expect(env.LEMONSQUEEZY_STORE_ID).toBe("");
    });

    test("throws when a required var is missing", () => {
        const partial = { ...FULL_CLOUD };
        delete (partial as Record<string, string | undefined>).DATABASE_URL;

        expect(() => loadEnv(partial)).toThrow(/DATABASE_URL/);
    });

    test("throws when SMTP_PORT is non-numeric", () => {
        expect(() => loadEnv({ ...FULL_CLOUD, SMTP_PORT: "not-a-port" })).toThrow(/SMTP_PORT/);
    });

    test("exposes BURSORA_KEY", () => {
        const env = loadEnv(BASE);
        expect(env.BURSORA_KEY).toBe(BASE.BURSORA_KEY);
    });

    test("throws when BURSORA_KEY is missing", () => {
        const partial = { ...BASE };
        delete (partial as Record<string, string | undefined>).BURSORA_KEY;
        expect(() => loadEnv(partial)).toThrow(/BURSORA_KEY/);
    });

    test("throws when BURSORA_KEY does not decode to 32 bytes", () => {
        expect(() => loadEnv({ ...BASE, BURSORA_KEY: "too-short" })).toThrow(/BURSORA_KEY/);
    });

    test("throws when LEMONSQUEEZY_API_KEY is missing in cloud mode", () => {
        const partial = { ...FULL_CLOUD };
        delete (partial as Record<string, string | undefined>).LEMONSQUEEZY_API_KEY;

        expect(() => loadEnv(partial)).toThrow(/LEMONSQUEEZY_API_KEY/);
    });

    test("throws when LEMONSQUEEZY_WEBHOOK_SECRET is missing in cloud mode", () => {
        const partial = { ...FULL_CLOUD };
        delete (partial as Record<string, string | undefined>).LEMONSQUEEZY_WEBHOOK_SECRET;

        expect(() => loadEnv(partial)).toThrow(/LEMONSQUEEZY_WEBHOOK_SECRET/);
    });

    test("throws when LEMONSQUEEZY_STORE_ID is missing in cloud mode", () => {
        const partial = { ...FULL_CLOUD };
        delete (partial as Record<string, string | undefined>).LEMONSQUEEZY_STORE_ID;

        expect(() => loadEnv(partial)).toThrow(/LEMONSQUEEZY_STORE_ID/);
    });

    test("exposes Google OAuth credentials", () => {
        const env = loadEnv(BASE);
        expect(env.GOOGLE_CLIENT_ID).toBe("google-client-id");
        expect(env.GOOGLE_CLIENT_SECRET).toBe("google-client-secret");
    });

    test("throws when GOOGLE_CLIENT_ID is missing", () => {
        const partial = { ...BASE };
        delete (partial as Record<string, string | undefined>).GOOGLE_CLIENT_ID;

        expect(() => loadEnv(partial)).toThrow(/GOOGLE_CLIENT_ID/);
    });

    test("throws when GOOGLE_CLIENT_SECRET is missing", () => {
        const partial = { ...BASE };
        delete (partial as Record<string, string | undefined>).GOOGLE_CLIENT_SECRET;

        expect(() => loadEnv(partial)).toThrow(/GOOGLE_CLIENT_SECRET/);
    });

    test("LEMONSQUEEZY_WEBHOOK_SECRET_NEXT is optional in cloud mode and exposed when set", () => {
        const withoutNext = loadEnv(FULL_CLOUD);
        expect(withoutNext.LEMONSQUEEZY_WEBHOOK_SECRET_NEXT).toBe("");

        const withNext = loadEnv({
            ...FULL_CLOUD,
            LEMONSQUEEZY_WEBHOOK_SECRET_NEXT: "ls_whsec_next",
        });
        expect(withNext.LEMONSQUEEZY_WEBHOOK_SECRET_NEXT).toBe("ls_whsec_next");
    });

    test("LEMONSQUEEZY_WEBHOOK_SECRET_NEXT is empty in OSS mode even if set in env", () => {
        const e = loadEnv({ ...BASE, LEMONSQUEEZY_WEBHOOK_SECRET_NEXT: "ignored" });
        expect(e.LEMONSQUEEZY_WEBHOOK_SECRET_NEXT).toBe("");
    });

    test("defaults rate-limit and spike-protection to cloud value", () => {
        const cloud = loadEnv(FULL_CLOUD);
        expect(cloud.BURSORA_RATE_LIMIT_ENABLED).toBe(true);
        expect(cloud.BURSORA_SPIKE_PROTECTION_ENABLED).toBe(true);

        const oss = loadEnv(BASE);
        expect(oss.BURSORA_RATE_LIMIT_ENABLED).toBe(false);
        expect(oss.BURSORA_SPIKE_PROTECTION_ENABLED).toBe(false);
    });

    test("requires REDIS_URL on every path", () => {
        const missing = { ...BASE };
        delete (missing as Record<string, string | undefined>).REDIS_URL;
        expect(() => loadEnv(missing)).toThrow(/REDIS_URL/);
        expect(() => loadEnv({ ...BASE, REDIS_URL: "" })).toThrow(/REDIS_URL/);
    });

    test("exposes REDIS_URL", () => {
        const e = loadEnv({ ...BASE, REDIS_URL: "redis://r" });
        expect(e.REDIS_URL).toBe("redis://r");
    });

    test("self-host can enable just the rate limiter", () => {
        const e = loadEnv({ ...BASE, BURSORA_RATE_LIMIT_ENABLED: "true" });
        expect(e.BURSORA_RATE_LIMIT_ENABLED).toBe(true);
        expect(e.BURSORA_SPIKE_PROTECTION_ENABLED).toBe(false);
    });

    test("cloud can opt out of the request-cap flags via explicit false", () => {
        const e = loadEnv({
            ...FULL_CLOUD,
            BURSORA_RATE_LIMIT_ENABLED: "false",
            BURSORA_SPIKE_PROTECTION_ENABLED: "false",
        });
        expect(e.BURSORA_RATE_LIMIT_ENABLED).toBe(false);
        expect(e.BURSORA_SPIKE_PROTECTION_ENABLED).toBe(false);
    });

    test("BETTER_AUTH_TRUSTED_ORIGINS defaults to the env URLs + local dev fallbacks (deduped)", () => {
        const e = loadEnv(BASE);
        // NEXT_PUBLIC_APP_URL and BETTER_AUTH_URL are both http://localhost:3000,
        // which dedup with the localhost:3000 fallback. Expect the unique dev origins.
        expect(e.BETTER_AUTH_TRUSTED_ORIGINS).toEqual([
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
        ]);
    });

    test("BETTER_AUTH_TRUSTED_ORIGINS prepends a non-local NEXT_PUBLIC_APP_URL to the dev fallbacks", () => {
        const e = loadEnv({ ...BASE, NEXT_PUBLIC_APP_URL: "https://app.bursora.com" });
        expect(e.BETTER_AUTH_TRUSTED_ORIGINS).toEqual([
            "https://app.bursora.com",
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
        ]);
    });

    test("BETTER_AUTH_TRUSTED_ORIGINS adds a single explicit origin to the env URLs + dev fallbacks", () => {
        const e = loadEnv({
            ...BASE,
            BETTER_AUTH_TRUSTED_ORIGINS: "https://app.bursora.com",
        });
        expect(e.BETTER_AUTH_TRUSTED_ORIGINS).toEqual([
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "https://app.bursora.com",
        ]);
    });

    test("BETTER_AUTH_TRUSTED_ORIGINS adds multiple comma-separated origins", () => {
        const e = loadEnv({
            ...BASE,
            BETTER_AUTH_TRUSTED_ORIGINS:
                "https://app.bursora.com,https://staging.bursora.com,https://admin.bursora.com",
        });
        expect(e.BETTER_AUTH_TRUSTED_ORIGINS).toEqual([
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "https://app.bursora.com",
            "https://staging.bursora.com",
            "https://admin.bursora.com",
        ]);
    });

    test("BETTER_AUTH_TRUSTED_ORIGINS trims whitespace and drops empty entries", () => {
        const e = loadEnv({
            ...BASE,
            BETTER_AUTH_TRUSTED_ORIGINS:
                "  https://app.bursora.com  ,, https://staging.bursora.com ,",
        });
        expect(e.BETTER_AUTH_TRUSTED_ORIGINS).toEqual([
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "https://app.bursora.com",
            "https://staging.bursora.com",
        ]);
    });

    test("BETTER_AUTH_TRUSTED_ORIGINS omits dev fallbacks in production, keeping only the env URLs", () => {
        const e = loadEnv({
            ...BASE,
            NODE_ENV: "production",
            NEXT_PUBLIC_APP_URL: "https://app.bursora.com",
            BETTER_AUTH_URL: "https://app.bursora.com",
        });
        expect(e.BETTER_AUTH_TRUSTED_ORIGINS).toEqual(["https://app.bursora.com"]);
    });

    test("requires CLICKHOUSE_URL on every path", () => {
        const missing = { ...BASE };
        delete (missing as Record<string, string | undefined>).CLICKHOUSE_URL;
        expect(() => loadEnv(missing)).toThrow(/CLICKHOUSE_URL/);
        expect(() => loadEnv({ ...BASE, CLICKHOUSE_URL: "" })).toThrow(/CLICKHOUSE_URL/);
    });

    test("ClickHouse credentials and database default when unset", () => {
        const e = loadEnv(BASE);
        expect(e.CLICKHOUSE_USER).toBe("default");
        expect(e.CLICKHOUSE_PASSWORD).toBe("");
        expect(e.CLICKHOUSE_DATABASE).toBe("default");
    });

    test("ClickHouse config reads URL, credentials, and database", () => {
        const e = loadEnv({
            ...BASE,
            CLICKHOUSE_URL: "http://ch:8123",
            CLICKHOUSE_USER: "bursora",
            CLICKHOUSE_PASSWORD: "secret",
            CLICKHOUSE_DATABASE: "events",
        });
        expect(e.CLICKHOUSE_URL).toBe("http://ch:8123");
        expect(e.CLICKHOUSE_USER).toBe("bursora");
        expect(e.CLICKHOUSE_PASSWORD).toBe("secret");
        expect(e.CLICKHOUSE_DATABASE).toBe("events");
    });

    test("BETTER_AUTH_TRUSTED_ORIGINS throws when set but empty (commas/whitespace only)", () => {
        expect(() =>
            loadEnv({
                ...BASE,
                BETTER_AUTH_TRUSTED_ORIGINS: "   , ,  ",
            }),
        ).toThrow(/BETTER_AUTH_TRUSTED_ORIGINS/);
    });
});

describe("env() cache reset", () => {
    // Snapshot every key we mutate so we can fully restore process.env. Without
    // this, leaking IS_CLOUD into later tests is exactly the bug being fixed.
    const KEYS = [
        "IS_CLOUD",
        "DATABASE_URL",
        "BURSORA_API_KEY_PEPPER",
        "BURSORA_KEY",
        "BETTER_AUTH_SECRET",
        "BETTER_AUTH_URL",
        "SMTP_HOST",
        "SMTP_PORT",
        "NEXT_PUBLIC_APP_URL",
        "LEMONSQUEEZY_API_KEY",
        "LEMONSQUEEZY_WEBHOOK_SECRET",
        "LEMONSQUEEZY_STORE_ID",
        "BURSORA_RATE_LIMIT_ENABLED",
        "BURSORA_SPIKE_PROTECTION_ENABLED",
        "REDIS_URL",
        "CLICKHOUSE_URL",
    ] as const;
    const snapshot = new Map<string, string | undefined>();

    afterEach(() => {
        for (const k of KEYS) {
            const prior = snapshot.get(k);
            if (prior === undefined) Reflect.deleteProperty(process.env, k);
            else process.env[k] = prior;
        }
        snapshot.clear();
        resetEnvCacheForTesting();
    });

    test("env() reflects fresh process.env after resetEnvCacheForTesting()", () => {
        for (const k of KEYS) snapshot.set(k, process.env[k]);

        process.env.DATABASE_URL = "postgres://x";
        process.env.BURSORA_API_KEY_PEPPER = "pepper";
        process.env.BURSORA_KEY = "x".repeat(43) + "=";
        process.env.BETTER_AUTH_SECRET = "secret";
        process.env.BETTER_AUTH_URL = "http://localhost:3000";
        process.env.SMTP_HOST = "localhost";
        process.env.SMTP_PORT = "1025";
        process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
        process.env.REDIS_URL = "redis://localhost:6379";
        process.env.CLICKHOUSE_URL = "http://localhost:8123";
        process.env.IS_CLOUD = "true";
        process.env.BURSORA_RATE_LIMIT_ENABLED = "false";
        process.env.BURSORA_SPIKE_PROTECTION_ENABLED = "false";
        process.env.LEMONSQUEEZY_API_KEY = "ls_test_x";
        process.env.LEMONSQUEEZY_WEBHOOK_SECRET = "ls_whsec_x";
        process.env.LEMONSQUEEZY_STORE_ID = "store_x";

        resetEnvCacheForTesting();
        expect(env().IS_CLOUD).toBe(true);

        delete process.env.IS_CLOUD;
        resetEnvCacheForTesting();
        expect(env().IS_CLOUD).toBe(false);
    });
});
