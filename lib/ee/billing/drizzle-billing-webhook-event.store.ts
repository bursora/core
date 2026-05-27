import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import type { BillingWebhookEventStore } from "./billing-webhook-event.store";

export class DrizzleBillingWebhookEventStore implements BillingWebhookEventStore {
    constructor(private readonly db: Db) {}

    async recordIfNew(input: { eventId: string; eventType: string }): Promise<boolean> {
        const inserted = await this.db
            .insert(schema.billingWebhookEvents)
            .values({ eventId: input.eventId, eventType: input.eventType })
            .onConflictDoNothing({ target: schema.billingWebhookEvents.eventId })
            .returning({ eventId: schema.billingWebhookEvents.eventId });
        return inserted.length > 0;
    }
}
