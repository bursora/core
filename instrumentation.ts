import * as Sentry from "@sentry/nextjs";

/**
 * Error tracking is opt-in. With `NEXT_PUBLIC_SENTRY_DSN` unset (the self-host
 * default) Sentry never initializes and every capture call is a no-op, so OSS
 * builds and self-hosters never phone home.
 */
const dsn = process.env.SENTRY_DSN;

export function register(): void {
    const runtime = process.env.NEXT_RUNTIME;
    if (runtime !== "nodejs" && runtime !== "edge") return;

    if (dsn) {
        Sentry.init({
            dsn,
            // Errors only. No performance tracing; keeps us inside the free tier.
            tracesSampleRate: 0,
            // Bots POST malformed multipart bodies to 404 routes; Next's FormData
            // parser throws on the missing boundary. Harmless scanner noise, drop it.
            ignoreErrors: ["missing final boundary while parsing FormData"],
        });
    }

    // Scheduled jobs run in-process on the long-lived Node.js server. Dynamic
    // import keeps croner out of the edge bundle; production-only so dev
    // restarts never fire provider syncs.
    if (runtime === "nodejs" && process.env.NODE_ENV === "production") {
        void import("@/lib/cron/scheduler")
            .then((m) => m.startCronScheduler())
            .catch((error: unknown) => console.error("cron.start.error", error));
    }
}

export const onRequestError = Sentry.captureRequestError;
