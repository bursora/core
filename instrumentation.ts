import * as Sentry from "@sentry/nextjs";

/**
 * Error tracking is opt-in. With `NEXT_PUBLIC_SENTRY_DSN` unset (the self-host
 * default) Sentry never initializes and every capture call is a no-op, so OSS
 * builds and self-hosters never phone home.
 */
const dsn = process.env.SENTRY_DSN;

export function register(): void {
    if (!dsn) return;
    const runtime = process.env.NEXT_RUNTIME;
    if (runtime !== "nodejs" && runtime !== "edge") return;
    Sentry.init({
        dsn,
        // Errors only. No performance tracing; keeps us inside the free tier.
        tracesSampleRate: 0,
    });
}

export const onRequestError = Sentry.captureRequestError;
