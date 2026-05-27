import type {
    WorkspaceBillingRecord,
    WorkspaceBillingRepository,
} from "@/lib/ee/billing/workspace-billing.repository";

interface BillingRow {
    workspaceId: string;
    providerCustomerId: string | null;
    providerSubscriptionId: string | null;
    subscriptionStatus: string | null;
    subscribedAt: Date | null;
    refundEligibleUntil: Date | null;
    lastInvoiceRef: string | null;
    lastBilledMonth: string | null;
}

export class InMemoryWorkspaceBillingRepository implements WorkspaceBillingRepository {
    private readonly rows = new Map<string, BillingRow>();

    seed(row: Partial<BillingRow> & { workspaceId: string }): void {
        this.rows.set(row.workspaceId, {
            workspaceId: row.workspaceId,
            providerCustomerId: row.providerCustomerId ?? null,
            providerSubscriptionId: row.providerSubscriptionId ?? null,
            subscriptionStatus: row.subscriptionStatus ?? null,
            subscribedAt: row.subscribedAt ?? null,
            refundEligibleUntil: row.refundEligibleUntil ?? null,
            lastInvoiceRef: row.lastInvoiceRef ?? null,
            lastBilledMonth: row.lastBilledMonth ?? null,
        });
    }

    async findById(workspaceId: string): Promise<WorkspaceBillingRecord | null> {
        const row = this.rows.get(workspaceId);
        return row ? toRecord(row) : null;
    }

    async findByProviderCustomerId(customerId: string): Promise<WorkspaceBillingRecord | null> {
        for (const row of this.rows.values()) {
            if (row.providerCustomerId === customerId) return toRecord(row);
        }
        return null;
    }

    async findByInvoiceRef(invoiceRef: string): Promise<WorkspaceBillingRecord | null> {
        for (const row of this.rows.values()) {
            if (row.lastInvoiceRef === invoiceRef) return toRecord(row);
        }
        return null;
    }

    async update(input: {
        workspaceId: string;
        providerCustomerId?: string | null;
        providerSubscriptionId?: string | null;
        subscriptionStatus?: string | null;
        subscribedAt?: Date | null;
        refundEligibleUntil?: Date | null;
        lastInvoiceRef?: string | null;
        lastBilledMonth?: string | null;
    }): Promise<void> {
        const existing = this.rows.get(input.workspaceId);
        if (!existing) {
            throw new Error(`workspace not found: ${input.workspaceId}`);
        }
        this.rows.set(input.workspaceId, {
            workspaceId: input.workspaceId,
            providerCustomerId:
                input.providerCustomerId === undefined
                    ? existing.providerCustomerId
                    : input.providerCustomerId,
            providerSubscriptionId:
                input.providerSubscriptionId === undefined
                    ? existing.providerSubscriptionId
                    : input.providerSubscriptionId,
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
            lastInvoiceRef:
                input.lastInvoiceRef === undefined ? existing.lastInvoiceRef : input.lastInvoiceRef,
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
        providerCustomerId: row.providerCustomerId,
        providerSubscriptionId: row.providerSubscriptionId,
        subscriptionStatus: row.subscriptionStatus,
        subscribedAt: row.subscribedAt,
        refundEligibleUntil: row.refundEligibleUntil,
        lastInvoiceRef: row.lastInvoiceRef,
        lastBilledMonth: row.lastBilledMonth,
    };
}
