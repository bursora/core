import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { and, eq, ne } from "drizzle-orm";
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

    async findByProviderSubscriptionId(subscriptionId: string): Promise<UserBillingRecord | null> {
        const [row] = await this.db
            .select()
            .from(schema.userSubscriptions)
            .where(eq(schema.userSubscriptions.providerSubscriptionId, subscriptionId))
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
        if (input.providerVariantId !== undefined) {
            set.providerVariantId = input.providerVariantId;
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
        const claimedSubscriptionId = set.providerSubscriptionId;
        await this.db.transaction(async (tx) => {
            // provider_subscription_id is unique to one user (reverse-resolve must
            // be unambiguous). When a concrete id is written, detach it from any
            // other user's row first so a serialized re-claim never trips the
            // unique index and 500s the activation webhook. A new checkout always
            // mints a fresh subscription id, so this only fires on a genuine
            // re-association; the newest claimant wins, the stale row keeps its
            // other fields but stops resolving by subscription id.
            //
            // provider_customer_id is intentionally NOT detached: one billing
            // customer can back several accounts the same person owns, so the id
            // is shared, not stolen.
            if (claimedSubscriptionId != null) {
                await tx
                    .update(schema.userSubscriptions)
                    .set({ providerSubscriptionId: null })
                    .where(
                        and(
                            eq(
                                schema.userSubscriptions.providerSubscriptionId,
                                claimedSubscriptionId,
                            ),
                            ne(schema.userSubscriptions.userId, input.userId),
                        ),
                    );
            }
            await tx
                .insert(schema.userSubscriptions)
                .values({ userId: input.userId, ...set })
                .onConflictDoUpdate({ target: schema.userSubscriptions.userId, set });
        });
    }
}

function toRecord(row: Row): UserBillingRecord {
    return {
        userId: row.userId,
        providerCustomerId: row.providerCustomerId ?? null,
        providerSubscriptionId: row.providerSubscriptionId ?? null,
        providerVariantId: row.providerVariantId ?? null,
        subscriptionStatus: row.subscriptionStatus ?? null,
        subscribedAt: row.subscribedAt ?? null,
        refundEligibleUntil: row.refundEligibleUntil ?? null,
    };
}
