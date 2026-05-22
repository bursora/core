import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import type { StripeWebhookEventStore } from "./stripe-webhook-event.store";

export class DrizzleStripeWebhookEventStore implements StripeWebhookEventStore {
    constructor(private readonly db: Db) {}

    async recordIfNew(input: { eventId: string; eventType: string }): Promise<boolean> {
        const inserted = await this.db
            .insert(schema.stripeWebhookEvents)
            .values({ eventId: input.eventId, eventType: input.eventType })
            .onConflictDoNothing({ target: schema.stripeWebhookEvents.eventId })
            .returning({ eventId: schema.stripeWebhookEvents.eventId });
        return inserted.length > 0;
    }
}
