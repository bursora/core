import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type {
    WorkspaceBillingRecord,
    WorkspaceBillingRepository,
    WorkspaceBillingUpdate,
} from "./workspace-billing.repository";

type Row = typeof schema.workspaces.$inferSelect;

export class DrizzleWorkspaceBillingRepository implements WorkspaceBillingRepository {
    constructor(private readonly db: Db) {}

    async findById(workspaceId: string): Promise<WorkspaceBillingRecord | null> {
        const [row] = await this.db
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, workspaceId))
            .limit(1);
        return row ? toRecord(row) : null;
    }

    async findByProviderCustomerId(customerId: string): Promise<WorkspaceBillingRecord | null> {
        const [row] = await this.db
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.providerCustomerId, customerId))
            .limit(1);
        return row ? toRecord(row) : null;
    }

    async findByInvoiceRef(invoiceRef: string): Promise<WorkspaceBillingRecord | null> {
        const [row] = await this.db
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.lastInvoiceRef, invoiceRef))
            .limit(1);
        return row ? toRecord(row) : null;
    }

    async update(input: WorkspaceBillingUpdate): Promise<void> {
        const set: Partial<typeof schema.workspaces.$inferInsert> = {};
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
        if (input.lastInvoiceRef !== undefined) {
            set.lastInvoiceRef = input.lastInvoiceRef;
        }
        if (input.lastBilledMonth !== undefined) {
            set.lastBilledMonth = input.lastBilledMonth;
        }
        if (Object.keys(set).length === 0) return;
        await this.db
            .update(schema.workspaces)
            .set(set)
            .where(eq(schema.workspaces.id, input.workspaceId));
    }
}

function toRecord(row: Row): WorkspaceBillingRecord {
    return {
        workspaceId: row.id,
        providerCustomerId: row.providerCustomerId ?? null,
        providerSubscriptionId: row.providerSubscriptionId ?? null,
        subscriptionStatus: row.subscriptionStatus ?? null,
        subscribedAt: row.subscribedAt ?? null,
        refundEligibleUntil: row.refundEligibleUntil ?? null,
        lastInvoiceRef: row.lastInvoiceRef ?? null,
        lastBilledMonth: row.lastBilledMonth ?? null,
    };
}
