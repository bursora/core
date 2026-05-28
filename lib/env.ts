/**
 * Environment validation. Called once at process boot. Anything here is
 * REQUIRED for the app to start — there are no sensible defaults for
 * secrets, URLs, or hashing peppers.
 *
 * `IS_CLOUD` toggles cloud-only features (billing, Lemon Squeezy). When false
 * (default), Lemon Squeezy variables are optional and the OSS build runs
 * without them. When true, the LS quartet becomes required.
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
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
] as const;

const CLOUD_REQUIRED = [
    "LEMONSQUEEZY_API_KEY",
    "LEMONSQUEEZY_WEBHOOK_SECRET",
    "LEMONSQUEEZY_STORE_ID",
    "LEMONSQUEEZY_VARIANT_ID",
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
    readonly GOOGLE_CLIENT_ID: string;
    readonly GOOGLE_CLIENT_SECRET: string;
    readonly IS_CLOUD: boolean;
    /** Empty string when `IS_CLOUD=false`. */
    readonly LEMONSQUEEZY_API_KEY: string;
    /** Empty string when `IS_CLOUD=false`. */
    readonly LEMONSQUEEZY_WEBHOOK_SECRET: string;
    /**
     * Optional second webhook secret for zero-downtime rotation. Empty when
     * unset (the common case) and always empty when `IS_CLOUD=false`. When
     * present, the LS adapter accepts signatures from either secret.
     */
    readonly LEMONSQUEEZY_WEBHOOK_SECRET_NEXT: string;
    /** Empty string when `IS_CLOUD=false`. */
    readonly LEMONSQUEEZY_STORE_ID: string;
    /** Empty string when `IS_CLOUD=false`. */
    readonly LEMONSQUEEZY_VARIANT_ID: string;
    /**
     * Which Lemon Squeezy environment the configured key + store target.
     * `test` while the LS store is in test mode; `live` once activated.
     * Defaults to `test`. Always `test` when `IS_CLOUD=false`.
     */
    readonly LEMONSQUEEZY_MODE: "test" | "live";
    readonly BURSORA_RATE_LIMIT_ENABLED: boolean;
    readonly BURSORA_SPIKE_PROTECTION_ENABLED: boolean;
    /** Empty string when both rate-limit and spike-protection are off. */
    readonly REDIS_URL: string;
    /**
     * CSRF allow-list for better-auth. Defaults to `[NEXT_PUBLIC_APP_URL,
     * 'http://localhost:3000', 'http://localhost:3001',
     * 'http://127.0.0.1:3000']` (deduped) so local dev across site (3000)
     * and core (3001) works without extra config. Set
     * `BETTER_AUTH_TRUSTED_ORIGINS` as a comma-separated list to override
     * for preview deployments or secondary domains.
     */
    readonly BETTER_AUTH_TRUSTED_ORIGINS: readonly string[];
}

const parseBool = (value: string | undefined, fallback: boolean): boolean => {
    if (value === undefined || value.length === 0) return fallback;
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
    return fallback;
};

/**
 * Parse a comma-separated origin list. Trims each entry and drops empties.
 * Unset / empty input falls back to `fallback`. Throws when the var is set
 * but resolves to no usable origins. An empty allow-list would reject every
 * cross-origin request, which is never what the operator intended.
 */
function parseTrustedOrigins(value: string | undefined, fallback: readonly string[]): string[] {
    if (value === undefined || value.trim().length === 0) return [...fallback];
    const origins = value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    if (origins.length === 0) {
        throw new Error(
            "BETTER_AUTH_TRUSTED_ORIGINS is set but contains no valid origins after trimming",
        );
    }
    return origins;
}

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

    let lemonSqueezyMode: "test" | "live" = "test";
    if (isCloud) {
        const rawMode = (source.LEMONSQUEEZY_MODE ?? "test").trim().toLowerCase();
        if (rawMode !== "test" && rawMode !== "live") {
            throw new Error(`LEMONSQUEEZY_MODE must be "test" or "live", got: ${source.LEMONSQUEEZY_MODE}`);
        }
        lemonSqueezyMode = rawMode;
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

    const appUrl = getAlways("NEXT_PUBLIC_APP_URL");
    const defaultOrigins = Array.from(
        new Set(
            isCloud
                ? [appUrl]
                : [
                      appUrl,
                      "http://localhost:3000",
                      "http://localhost:3001",
                      "http://127.0.0.1:3000",
                      "https://app-bursora.ngrok.app",
                      "https://bursora.ngrok.app",
                  ],
        ),
    );
    const trustedOrigins = Object.freeze(
        parseTrustedOrigins(source.BETTER_AUTH_TRUSTED_ORIGINS, defaultOrigins),
    );

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
        GOOGLE_CLIENT_ID: getAlways("GOOGLE_CLIENT_ID"),
        GOOGLE_CLIENT_SECRET: getAlways("GOOGLE_CLIENT_SECRET"),
        IS_CLOUD: isCloud,
        LEMONSQUEEZY_API_KEY: getCloud("LEMONSQUEEZY_API_KEY"),
        LEMONSQUEEZY_WEBHOOK_SECRET: getCloud("LEMONSQUEEZY_WEBHOOK_SECRET"),
        LEMONSQUEEZY_WEBHOOK_SECRET_NEXT: isCloud
            ? (source.LEMONSQUEEZY_WEBHOOK_SECRET_NEXT ?? "")
            : "",
        LEMONSQUEEZY_STORE_ID: getCloud("LEMONSQUEEZY_STORE_ID"),
        LEMONSQUEEZY_VARIANT_ID: getCloud("LEMONSQUEEZY_VARIANT_ID"),
        LEMONSQUEEZY_MODE: lemonSqueezyMode,
        BURSORA_RATE_LIMIT_ENABLED: rateLimitEnabled,
        BURSORA_SPIKE_PROTECTION_ENABLED: spikeProtectionEnabled,
        REDIS_URL: needsRedis ? (source.REDIS_URL ?? "") : "",
        BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins,
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

/**
 * Drop the memoized env so the next `env()` call re-reads `process.env`.
 * Test-only: cloud-mode tests mutate `process.env` and must reset, otherwise
 * the cached cloud env leaks into later self-host tests in the same in-process
 * run.
 */
export function resetEnvCacheForTesting(): void {
    cached = null;
}
