import type { BillingWebhookEventStore } from "@/lib/ee/billing";

export class InMemoryBillingWebhookEventStore implements BillingWebhookEventStore {
    private readonly rows = new Map<string, Date>();

    async recordIfNew(input: { eventId: string; eventType: string }): Promise<boolean> {
        if (this.rows.has(input.eventId)) return false;
        this.rows.set(input.eventId, new Date());
        return true;
    }

    async deleteByEventId(eventId: string): Promise<void> {
        this.rows.delete(eventId);
    }

    async pruneOlderThan(cutoff: Date): Promise<number> {
        let deleted = 0;
        for (const [eventId, processedAt] of this.rows) {
            if (processedAt < cutoff) {
                this.rows.delete(eventId);
                deleted += 1;
            }
        }
        return deleted;
    }

    /** Test-only: insert a row with an explicit `processed_at`. */
    seed(eventId: string, processedAt: Date): void {
        this.rows.set(eventId, processedAt);
    }

    /** Test-only: whether a row with this id is still present. */
    has(eventId: string): boolean {
        return this.rows.has(eventId);
    }
}
