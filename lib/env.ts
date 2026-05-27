/**
 * Environment validation. Called once at process boot. Anything here is
 * REQUIRED for the app to start — there are no sensible defaults for
 * secrets, URLs, or hashing peppers.
 *
 * `IS_CLOUD` toggles cloud-only features (billing, Stripe). When false
 * (default), Stripe variables are optional and the OSS build runs without
 * them. When true, the Stripe trio becomes required.
 *
 * `BURSORA_RATE_LIMIT_ENABLED` and `BURSORA_SPIKE_PROTECTION_ENABLED` gate
 * the request-cap stack. Both default to `true` on cloud and `false` on
 * self-host. `REDIS_URL` is required only when at least one of the two flags
 * is on — self-host installs that never enable either flag can skip it.
 *
 * Optional things (NODE_ENV, APP_URL) are read directly off `process.env`
 * by their consumers; we don't gate boot on them.
 */

import "server-only";

const ALWAYS_REQUIRED = [
    "DATABASE_URL",
    "BURSORA_API_KEY_PEPPER",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "SMTP_HOST",
    "SMTP_PORT",
    "CRON_SECRET",
    "NEXT_PUBLIC_APP_URL",
] as const;

const CLOUD_REQUIRED = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_ID_TEAM",
] as const;

type AlwaysKey = (typeof ALWAYS_REQUIRED)[number];
type CloudKey = (typeof CLOUD_REQUIRED)[number];

export interface Env {
    readonly DATABASE_URL: string;
    readonly BURSORA_API_KEY_PEPPER: string;
    readonly BETTER_AUTH_SECRET: string;
    readonly BETTER_AUTH_URL: string;
    readonly SMTP_HOST: string;
    readonly SMTP_PORT: number;
    /** Empty when SMTP relay is unauthenticated (Mailhog in dev). */
    readonly SMTP_USER: string;
    /** Empty when SMTP relay is unauthenticated. */
    readonly SMTP_PASS: string;
    readonly CRON_SECRET: string;
    readonly NEXT_PUBLIC_APP_URL: string;
    readonly IS_CLOUD: boolean;
    /** Empty string when `IS_CLOUD=false`. */
    readonly STRIPE_SECRET_KEY: string;
    /** Empty string when `IS_CLOUD=false`. */
    readonly STRIPE_WEBHOOK_SECRET: string;
    /** Empty string when `IS_CLOUD=false`. */
    readonly STRIPE_PRICE_ID_TEAM: string;
    readonly BURSORA_RATE_LIMIT_ENABLED: boolean;
    readonly BURSORA_SPIKE_PROTECTION_ENABLED: boolean;
    /** Empty string when both rate-limit and spike-protection are off. */
    readonly REDIS_URL: string;
}

const parseBool = (value: string | undefined, fallback: boolean): boolean => {
    if (value === undefined || value.length === 0) return fallback;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
    return fallback;
};

export function loadEnv(source: Record<string, string | undefined>): Env {
    const isCloud = parseBool(source.IS_CLOUD, false);
    const rateLimitEnabled = parseBool(source.BURSORA_RATE_LIMIT_ENABLED, isCloud);
    const spikeProtectionEnabled = parseBool(source.BURSORA_SPIKE_PROTECTION_ENABLED, isCloud);
    const needsRedis = rateLimitEnabled || spikeProtectionEnabled;

    const missing: string[] = [];
    for (const key of ALWAYS_REQUIRED) {
        const value = source[key];
        if (value === undefined || value.length === 0) {
            missing.push(key);
        }
    }
    if (isCloud) {
        for (const key of CLOUD_REQUIRED) {
            const value = source[key];
            if (value === undefined || value.length === 0) {
                missing.push(key);
            }
        }
    }
    if (needsRedis) {
        const value = source.REDIS_URL;
        if (value === undefined || value.length === 0) {
            missing.push("REDIS_URL");
        }
    }
    if (missing.length > 0) {
        throw new Error(`Missing required env vars: ${missing.join(", ")}`);
    }

    const port = Number(source.SMTP_PORT);
    if (!Number.isInteger(port) || port <= 0) {
        throw new Error(`SMTP_PORT must be a positive integer, got: ${source.SMTP_PORT}`);
    }

    const smtpUser = source.SMTP_USER ?? "";
    const smtpPass = source.SMTP_PASS ?? "";
    if (smtpUser.length > 0 !== smtpPass.length > 0) {
        throw new Error("SMTP_USER and SMTP_PASS must be both set or both empty");
    }

    const getAlways = (k: AlwaysKey): string => {
        const v = source[k];
        if (v === undefined) throw new Error(`Missing env: ${k}`); // unreachable after check above
        return v;
    };

    const getCloud = (k: CloudKey): string => {
        if (!isCloud) return "";
        const v = source[k];
        if (v === undefined) throw new Error(`Missing env: ${k}`); // unreachable after check above
        return v;
    };

    return Object.freeze({
        DATABASE_URL: getAlways("DATABASE_URL"),
        BURSORA_API_KEY_PEPPER: getAlways("BURSORA_API_KEY_PEPPER"),
        BETTER_AUTH_SECRET: getAlways("BETTER_AUTH_SECRET"),
        BETTER_AUTH_URL: getAlways("BETTER_AUTH_URL"),
        SMTP_HOST: getAlways("SMTP_HOST"),
        SMTP_PORT: port,
        SMTP_USER: smtpUser,
        SMTP_PASS: smtpPass,
        CRON_SECRET: getAlways("CRON_SECRET"),
        NEXT_PUBLIC_APP_URL: getAlways("NEXT_PUBLIC_APP_URL"),
        IS_CLOUD: isCloud,
        STRIPE_SECRET_KEY: getCloud("STRIPE_SECRET_KEY"),
        STRIPE_WEBHOOK_SECRET: getCloud("STRIPE_WEBHOOK_SECRET"),
        STRIPE_PRICE_ID_TEAM: getCloud("STRIPE_PRICE_ID_TEAM"),
        BURSORA_RATE_LIMIT_ENABLED: rateLimitEnabled,
        BURSORA_SPIKE_PROTECTION_ENABLED: spikeProtectionEnabled,
        REDIS_URL: needsRedis ? (source.REDIS_URL ?? "") : "",
    });
}

let cached: Env | null = null;

/**
 * Lazily validate `process.env`. The first call freezes the result; later
 * calls return the same object so consumers can rely on identity for
 * memoization tricks.
 */
export function env(): Env {
    if (cached === null) {
        cached = loadEnv(process.env);
    }
    return cached;
}
