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

    async findByStripeCustomerId(customerId: string): Promise<WorkspaceBillingRecord | null> {
        const [row] = await this.db
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.stripeCustomerId, customerId))
            .limit(1);
        return row ? toRecord(row) : null;
    }

    async findByStripeInvoiceId(invoiceId: string): Promise<WorkspaceBillingRecord | null> {
        const [row] = await this.db
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.lastInvoiceId, invoiceId))
            .limit(1);
        return row ? toRecord(row) : null;
    }

    async update(input: WorkspaceBillingUpdate): Promise<void> {
        const set: Partial<typeof schema.workspaces.$inferInsert> = {};
        if (input.stripeCustomerId !== undefined) {
            set.stripeCustomerId = input.stripeCustomerId;
        }
        if (input.stripeSubscriptionId !== undefined) {
            set.stripeSubscriptionId = input.stripeSubscriptionId;
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
        if (input.lastInvoiceId !== undefined) {
            set.lastInvoiceId = input.lastInvoiceId;
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
        stripeCustomerId: row.stripeCustomerId ?? null,
        stripeSubscriptionId: row.stripeSubscriptionId ?? null,
        subscriptionStatus: row.subscriptionStatus ?? null,
        subscribedAt: row.subscribedAt ?? null,
        refundEligibleUntil: row.refundEligibleUntil ?? null,
        lastInvoiceId: row.lastInvoiceId ?? null,
        lastBilledMonth: row.lastBilledMonth ?? null,
    };
}
