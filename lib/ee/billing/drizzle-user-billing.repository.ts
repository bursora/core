import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type {
    UserBillingRecord,
    UserBillingRepository,
    UserBillingUpsert,
} from "./user-billing.repository";

type Row = typeof schema.userSubscriptions.$inferSelect;

export class DrizzleUserBillingRepository implements UserBillingRepository {
    constructor(private readonly db: Db) {}

    async findByUserId(userId: string): Promise<UserBillingRecord | null> {
        const [row] = await this.db
            .select()
            .from(schema.userSubscriptions)
            .where(eq(schema.userSubscriptions.userId, userId))
            .limit(1);
        return row ? toRecord(row) : null;
    }

    async findByProviderCustomerId(customerId: string): Promise<UserBillingRecord | null> {
        const [row] = await this.db
            .select()
            .from(schema.userSubscriptions)
            .where(eq(schema.userSubscriptions.providerCustomerId, customerId))
            .limit(1);
        return row ? toRecord(row) : null;
    }

    async upsert(input: UserBillingUpsert): Promise<void> {
        // Only the provided fields are written: on insert the rest fall back to
        // their column defaults (NULL); on conflict only the provided fields are
        // overwritten, so a partial update never clobbers untouched state.
        const set: Partial<typeof schema.userSubscriptions.$inferInsert> = {};
        if (input.providerCustomerId !== undefined) {
            set.providerCustomerId = input.providerCustomerId;
        }
        if (input.providerSubscriptionId !== undefined) {
            set.providerSubscriptionId = input.providerSubscriptionId;
        }
        if (input.subscriptionStatus !== undefined) {
            set.subscriptionStatus = input.subscriptionStatus;
        }
        if (input.subscribedAt !== undefined) {
            set.subscribedAt = input.subscribedAt;
        }
        if (input.refundEligibleUntil !== undefined) {
            set.refundEligibleUntil = input.refundEligibleUntil;
        }
        await this.db
            .insert(schema.userSubscriptions)
            .values({ userId: input.userId, ...set })
            .onConflictDoUpdate({ target: schema.userSubscriptions.userId, set });
    }
}

function toRecord(row: Row): UserBillingRecord {
    return {
        userId: row.userId,
        providerCustomerId: row.providerCustomerId ?? null,
        providerSubscriptionId: row.providerSubscriptionId ?? null,
        subscriptionStatus: row.subscriptionStatus ?? null,
        subscribedAt: row.subscribedAt ?? null,
        refundEligibleUntil: row.refundEligibleUntil ?? null,
    };
}
