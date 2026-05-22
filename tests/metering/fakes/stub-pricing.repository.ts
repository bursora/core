import type {
    NewPricingRow,
    PricingRepository,
    PricingRow,
} from "@/lib/metering/pricing/pricing-row";

/**
 * Minimal stub PricingRepository for metering tests. Only `findCandidatesForLookup`
 * is exercised — the write paths (insert, closeAndInsert, findLatestGlobal) are
 * not used here and throw to make accidental coupling loud.
 */
export class StubPricingRepository implements PricingRepository {
    private readonly rows: PricingRow[] = [];

    addRow(row: PricingRow): void {
        this.rows.push(row);
    }

    async findLatestGlobal(): Promise<PricingRow | null> {
        throw new Error("not used in metering tests");
    }

    async closeAndInsert(): Promise<void> {
        throw new Error("not used in metering tests");
    }

    async insert(_row: NewPricingRow): Promise<void> {
        throw new Error("not used in metering tests");
    }

    async findCandidatesForLookup(input: {
        provider: string;
        model: string;
        region: string;
        workspaceId: string;
    }): Promise<readonly PricingRow[]> {
        return this.rows.filter(
            (r) =>
                r.provider === input.provider &&
                r.model === input.model &&
                r.region === input.region &&
                (r.workspaceId === null || r.workspaceId === input.workspaceId),
        );
    }

    async findAllCandidatesForWorkspace(workspaceId: string): Promise<readonly PricingRow[]> {
        return this.rows.filter((r) => r.workspaceId === null || r.workspaceId === workspaceId);
    }

    async insertOverride(): Promise<PricingRow> {
        throw new Error("not used in metering tests");
    }

    async listOverridesByWorkspace(): Promise<readonly PricingRow[]> {
        throw new Error("not used in metering tests");
    }

    async deleteOverride(): Promise<boolean> {
        throw new Error("not used in metering tests");
    }

    async updateOverride(): Promise<PricingRow | null> {
        throw new Error("not used in metering tests");
    }
}
