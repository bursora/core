import type {
    UserBillingRecord,
    UserBillingRepository,
    UserBillingUpsert,
} from "@/lib/ee/billing/user-billing.repository";

type Row = {
    userId: string;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    providerVariantId: string | null;
    subscriptionStatus: string | null;
    subscribedAt: Date | null;
    refundEligibleUntil: Date | null;
};

export class InMemoryUserBillingRepository implements UserBillingRepository {
    private readonly rows = new Map<string, Row>();

    seed(row: Partial<Row> & { userId: string }): void {
        this.rows.set(row.userId, {
            userId: row.userId,
            providerCustomerId: row.providerCustomerId ?? null,
            providerSubscriptionId: row.providerSubscriptionId ?? null,
            providerVariantId: row.providerVariantId ?? null,
            subscriptionStatus: row.subscriptionStatus ?? null,
            subscribedAt: row.subscribedAt ?? null,
            refundEligibleUntil: row.refundEligibleUntil ?? null,
        });
    }

    async findByUserId(userId: string): Promise<UserBillingRecord | null> {
        const row = this.rows.get(userId);
        return row ? { ...row } : null;
    }

    async findByProviderCustomerId(customerId: string): Promise<UserBillingRecord | null> {
        for (const row of this.rows.values()) {
            if (row.providerCustomerId === customerId) return { ...row };
        }
        return null;
    }

    async findByProviderSubscriptionId(subscriptionId: string): Promise<UserBillingRecord | null> {
        for (const row of this.rows.values()) {
            if (row.providerSubscriptionId === subscriptionId) return { ...row };
        }
        return null;
    }

    async upsert(input: UserBillingUpsert): Promise<void> {
        // Mirror the unique(provider_subscription_id) index: a concrete
        // subscription id written here is detached from any other user's row
        // first, so the id only ever resolves to one user. Customer ids are
        // shared across a person's accounts, so they are never detached.
        if (input.providerSubscriptionId != null) {
            for (const [userId, row] of this.rows) {
                if (
                    userId !== input.userId &&
                    row.providerSubscriptionId === input.providerSubscriptionId
                ) {
                    this.rows.set(userId, { ...row, providerSubscriptionId: null });
                }
            }
        }
        const existing = this.rows.get(input.userId);
        const base: Row = existing ?? {
            userId: input.userId,
            providerCustomerId: null,
            providerSubscriptionId: null,
            providerVariantId: null,
            subscriptionStatus: null,
            subscribedAt: null,
            refundEligibleUntil: null,
        };
        this.rows.set(input.userId, {
            userId: input.userId,
            providerCustomerId:
                input.providerCustomerId === undefined
                    ? base.providerCustomerId
                    : input.providerCustomerId,
            providerSubscriptionId:
                input.providerSubscriptionId === undefined
                    ? base.providerSubscriptionId
                    : input.providerSubscriptionId,
            providerVariantId:
                input.providerVariantId === undefined
                    ? base.providerVariantId
                    : input.providerVariantId,
            subscriptionStatus:
                input.subscriptionStatus === undefined
                    ? base.subscriptionStatus
                    : input.subscriptionStatus,
            subscribedAt: input.subscribedAt === undefined ? base.subscribedAt : input.subscribedAt,
            refundEligibleUntil:
                input.refundEligibleUntil === undefined
                    ? base.refundEligibleUntil
                    : input.refundEligibleUntil,
        });
    }
}
