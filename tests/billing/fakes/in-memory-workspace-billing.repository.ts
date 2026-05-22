import type {
    WorkspaceBillingRecord,
    WorkspaceBillingRepository,
} from "@/lib/ee/billing/workspace-billing.repository";

interface BillingRow {
    workspaceId: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    subscriptionStatus: string | null;
    subscribedAt: Date | null;
    refundEligibleUntil: Date | null;
    lastInvoiceId: string | null;
    lastBilledMonth: string | null;
}

export class InMemoryWorkspaceBillingRepository implements WorkspaceBillingRepository {
    private readonly rows = new Map<string, BillingRow>();

    seed(row: Partial<BillingRow> & { workspaceId: string }): void {
        this.rows.set(row.workspaceId, {
            workspaceId: row.workspaceId,
            stripeCustomerId: row.stripeCustomerId ?? null,
            stripeSubscriptionId: row.stripeSubscriptionId ?? null,
            subscriptionStatus: row.subscriptionStatus ?? null,
            subscribedAt: row.subscribedAt ?? null,
            refundEligibleUntil: row.refundEligibleUntil ?? null,
            lastInvoiceId: row.lastInvoiceId ?? null,
            lastBilledMonth: row.lastBilledMonth ?? null,
        });
    }

    async findById(workspaceId: string): Promise<WorkspaceBillingRecord | null> {
        const row = this.rows.get(workspaceId);
        return row ? toRecord(row) : null;
    }

    async findByStripeCustomerId(customerId: string): Promise<WorkspaceBillingRecord | null> {
        for (const row of this.rows.values()) {
            if (row.stripeCustomerId === customerId) return toRecord(row);
        }
        return null;
    }

    async findByStripeInvoiceId(invoiceId: string): Promise<WorkspaceBillingRecord | null> {
        for (const row of this.rows.values()) {
            if (row.lastInvoiceId === invoiceId) return toRecord(row);
        }
        return null;
    }

    async update(input: {
        workspaceId: string;
        stripeCustomerId?: string | null;
        stripeSubscriptionId?: string | null;
        subscriptionStatus?: string | null;
        subscribedAt?: Date | null;
        refundEligibleUntil?: Date | null;
        lastInvoiceId?: string | null;
        lastBilledMonth?: string | null;
    }): Promise<void> {
        const existing = this.rows.get(input.workspaceId);
        if (!existing) {
            throw new Error(`workspace not found: ${input.workspaceId}`);
        }
        this.rows.set(input.workspaceId, {
            workspaceId: input.workspaceId,
            stripeCustomerId:
                input.stripeCustomerId === undefined
                    ? existing.stripeCustomerId
                    : input.stripeCustomerId,
            stripeSubscriptionId:
                input.stripeSubscriptionId === undefined
                    ? existing.stripeSubscriptionId
                    : input.stripeSubscriptionId,
            subscriptionStatus:
                input.subscriptionStatus === undefined
                    ? existing.subscriptionStatus
                    : input.subscriptionStatus,
            subscribedAt:
                input.subscribedAt === undefined ? existing.subscribedAt : input.subscribedAt,
            refundEligibleUntil:
                input.refundEligibleUntil === undefined
                    ? existing.refundEligibleUntil
                    : input.refundEligibleUntil,
            lastInvoiceId:
                input.lastInvoiceId === undefined ? existing.lastInvoiceId : input.lastInvoiceId,
            lastBilledMonth:
                input.lastBilledMonth === undefined
                    ? existing.lastBilledMonth
                    : input.lastBilledMonth,
        });
    }
}

function toRecord(row: BillingRow): WorkspaceBillingRecord {
    return {
        workspaceId: row.workspaceId,
        stripeCustomerId: row.stripeCustomerId,
        stripeSubscriptionId: row.stripeSubscriptionId,
        subscriptionStatus: row.subscriptionStatus,
        subscribedAt: row.subscribedAt,
        refundEligibleUntil: row.refundEligibleUntil,
        lastInvoiceId: row.lastInvoiceId,
        lastBilledMonth: row.lastBilledMonth,
    };
}
