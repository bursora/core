/**
 * Tests for the billing webhook-event prune path.
 *
 * `billing_webhook_events` is an append-only idempotency log. LS stops
 * retrying within days, so rows older than the retention window are pure
 * forensic weight. The store's `pruneOlderThan` deletes them.
 *
 * Behaviors under test:
 *   1. Store contract: rows with processed_at < cutoff are deleted, newer
 *      rows are kept, and the deleted count is returned.
 *   2. Retention window: the cron prunes rows older than 90 days.
 *
 * Both use in-memory fakes / pure helpers — no DB, no time-of-day flakiness.
 */

import { BILLING_WEBHOOK_RETENTION_DAYS, billingWebhookPruneCutoff } from "@/lib/ee/billing";
import { describe, expect, test } from "bun:test";
import { InMemoryBillingWebhookEventStore } from "./fakes/in-memory-billing-webhook-event.store";

const NOW = new Date("2025-05-10T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY_MS);

describe("BillingWebhookEventStore.pruneOlderThan", () => {
    test("deletes only rows older than the cutoff and returns the count", async () => {
        const store = new InMemoryBillingWebhookEventStore();
        store.seed("evt_old_1", daysAgo(120));
        store.seed("evt_old_2", daysAgo(91));
        store.seed("evt_boundary", daysAgo(90));
        store.seed("evt_fresh", daysAgo(5));

        const deleted = await store.pruneOlderThan(daysAgo(90));

        expect(deleted).toBe(2);
        // Boundary row (== cutoff) and fresh row survive: prune is strict <.
        expect(store.has("evt_boundary")).toBe(true);
        expect(store.has("evt_fresh")).toBe(true);
        expect(store.has("evt_old_1")).toBe(false);
        expect(store.has("evt_old_2")).toBe(false);
    });

    test("returns 0 when no rows are older than the cutoff", async () => {
        const store = new InMemoryBillingWebhookEventStore();
        store.seed("evt_fresh", daysAgo(1));

        expect(await store.pruneOlderThan(daysAgo(90))).toBe(0);
        expect(store.has("evt_fresh")).toBe(true);
    });
});

describe("billingWebhookPruneCutoff", () => {
    test("retention window is 90 days", () => {
        expect(BILLING_WEBHOOK_RETENTION_DAYS).toBe(90);
    });

    test("cutoff is exactly the retention window before now", () => {
        expect(billingWebhookPruneCutoff(NOW).getTime()).toBe(daysAgo(90).getTime());
    });
});
