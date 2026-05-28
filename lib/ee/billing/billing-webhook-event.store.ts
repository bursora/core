/**
 * Idempotency log for billing-provider webhook events.
 *
 * Upstream providers retry deliveries on any non-2xx response (and
 * occasionally re-deliver 2xx events). Without dedup, a replay of
 * `customer.subscription.deleted` after a later `checkout.session.completed`
 * would flip a paying workspace back to free. The webhook handler records
 * every event id before applying side effects and short-circuits if the id
 * has been seen already.
 */

export interface BillingWebhookEventStore {
    /**
     * Insert (event_id, event_type). Returns `true` if this is the first time
     * we see the id, `false` if it was already recorded (i.e. a replay).
     * Implementations rely on `ON CONFLICT DO NOTHING` on a primary-key column
     * so the check-and-insert is a single atomic statement.
     */
    recordIfNew(input: { readonly eventId: string; readonly eventType: string }): Promise<boolean>;

    /**
     * Delete every recorded event whose `processed_at` is strictly older than
     * `cutoff`. Returns the number of rows removed. The daily prune cron calls
     * this to keep the append-only idempotency log from growing without bound:
     * upstream retries cap within days, so rows past the retention window are
     * pure forensic weight.
     */
    pruneOlderThan(cutoff: Date): Promise<number>;
}
