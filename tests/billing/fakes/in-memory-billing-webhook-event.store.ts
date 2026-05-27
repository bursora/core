import type { BillingWebhookEventStore } from "@/lib/ee/billing";

export class InMemoryBillingWebhookEventStore implements BillingWebhookEventStore {
    private readonly seen = new Set<string>();

    async recordIfNew(input: { eventId: string; eventType: string }): Promise<boolean> {
        if (this.seen.has(input.eventId)) return false;
        this.seen.add(input.eventId);
        return true;
    }
}
