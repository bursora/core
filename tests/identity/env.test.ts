import { loadEnv } from "@/lib/env";
import { describe, expect, test } from "bun:test";

const BASE = {
    DATABASE_URL: "postgres://x",
    BURSORA_API_KEY_PEPPER: "pepper",
    BETTER_AUTH_SECRET: "secret",
    BETTER_AUTH_URL: "http://localhost:3000",
    SMTP_HOST: "localhost",
    SMTP_PORT: "1025",
    CRON_SECRET: "cron-secret",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};

const FULL_CLOUD = {
    ...BASE,
    IS_CLOUD: "true",
    LEMONSQUEEZY_API_KEY: "ls_test_x",
    LEMONSQUEEZY_WEBHOOK_SECRET: "ls_whsec_x",
    LEMONSQUEEZY_STORE_ID: "store_x",
    LEMONSQUEEZY_VARIANT_ID: "variant_x",
    REDIS_URL: "redis://localhost:6379",
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
        expect(env.LEMONSQUEEZY_VARIANT_ID).toBe("variant_x");
    });

    test("OSS mode does not require Lemon Squeezy vars and exposes empty strings", () => {
        const env = loadEnv(BASE);

        expect(env.IS_CLOUD).toBe(false);
        expect(env.LEMONSQUEEZY_API_KEY).toBe("");
        expect(env.LEMONSQUEEZY_WEBHOOK_SECRET).toBe("");
        expect(env.LEMONSQUEEZY_STORE_ID).toBe("");
        expect(env.LEMONSQUEEZY_VARIANT_ID).toBe("");
    });

    test("throws when a required var is missing", () => {
        const partial = { ...FULL_CLOUD };
        delete (partial as Record<string, string | undefined>).DATABASE_URL;

        expect(() => loadEnv(partial)).toThrow(/DATABASE_URL/);
    });

    test("throws when SMTP_PORT is non-numeric", () => {
        expect(() => loadEnv({ ...FULL_CLOUD, SMTP_PORT: "not-a-port" })).toThrow(/SMTP_PORT/);
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

    test("throws when LEMONSQUEEZY_VARIANT_ID is missing in cloud mode", () => {
        const partial = { ...FULL_CLOUD };
        delete (partial as Record<string, string | undefined>).LEMONSQUEEZY_VARIANT_ID;

        expect(() => loadEnv(partial)).toThrow(/LEMONSQUEEZY_VARIANT_ID/);
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
        const cloud = loadEnv({ ...FULL_CLOUD, REDIS_URL: "redis://localhost:6379" });
        expect(cloud.BURSORA_RATE_LIMIT_ENABLED).toBe(true);
        expect(cloud.BURSORA_SPIKE_PROTECTION_ENABLED).toBe(true);
        expect(cloud.REDIS_URL).toBe("redis://localhost:6379");

        const oss = loadEnv(BASE);
        expect(oss.BURSORA_RATE_LIMIT_ENABLED).toBe(false);
        expect(oss.BURSORA_SPIKE_PROTECTION_ENABLED).toBe(false);
        expect(oss.REDIS_URL).toBe("");
    });

    test("requires REDIS_URL when either flag is on", () => {
        expect(() => loadEnv({ ...BASE, BURSORA_RATE_LIMIT_ENABLED: "true" })).toThrow(/REDIS_URL/);
        expect(() => loadEnv({ ...BASE, BURSORA_SPIKE_PROTECTION_ENABLED: "true" })).toThrow(
            /REDIS_URL/,
        );
    });

    test("self-host can enable just the rate limiter with REDIS_URL", () => {
        const e = loadEnv({
            ...BASE,
            BURSORA_RATE_LIMIT_ENABLED: "true",
            REDIS_URL: "redis://r",
        });
        expect(e.BURSORA_RATE_LIMIT_ENABLED).toBe(true);
        expect(e.BURSORA_SPIKE_PROTECTION_ENABLED).toBe(false);
        expect(e.REDIS_URL).toBe("redis://r");
    });

    test("cloud can opt out via explicit false", () => {
        const e = loadEnv({
            ...FULL_CLOUD,
            BURSORA_RATE_LIMIT_ENABLED: "false",
            BURSORA_SPIKE_PROTECTION_ENABLED: "false",
        });
        expect(e.BURSORA_RATE_LIMIT_ENABLED).toBe(false);
        expect(e.BURSORA_SPIKE_PROTECTION_ENABLED).toBe(false);
        expect(e.REDIS_URL).toBe("");
    });
});
