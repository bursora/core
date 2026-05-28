/**
 * Retention policy for the `billing_webhook_events` idempotency log.
 *
 * Upstream providers (Lemon Squeezy) stop retrying webhook deliveries within
 * days, so a row's only job after that is forensic. We keep 90 days, then the
 * daily prune cron deletes anything older. Self-host and cloud share the same
 * window; the cron is cloud-only because billing is cloud-only.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const BILLING_WEBHOOK_RETENTION_DAYS = 90;

/** The instant before which webhook-event rows are safe to delete. */
export function billingWebhookPruneCutoff(now: Date): Date {
    return new Date(now.getTime() - BILLING_WEBHOOK_RETENTION_DAYS * DAY_MS);
}
