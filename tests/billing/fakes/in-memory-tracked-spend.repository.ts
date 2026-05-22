import type {
    MonthlySpendQuery,
    TrackedSpendRepository,
} from "@/lib/ee/billing/tracked-spend.repository";

/**
 * In-memory fake for `TrackedSpendRepository`. Tests `seed` per-(workspace,
 * monthKey) totals; the use case reads them through `sumMonthlySpendCents`
 * by deriving the same month key from `from`.
 */
export class InMemoryTrackedSpendRepository implements TrackedSpendRepository {
    private readonly spendByMonth = new Map<string, number>();
    private activeIds: string[] = [];

    seedSpend(input: { workspaceId: string; month: string; cents: number }): void {
        this.spendByMonth.set(`${input.workspaceId}:${input.month}`, input.cents);
    }

    seedActiveIds(ids: readonly string[]): void {
        this.activeIds = [...ids];
    }

    async sumMonthlySpendCents(query: MonthlySpendQuery): Promise<number> {
        const month = monthKeyFromDate(query.from);
        return this.spendByMonth.get(`${query.workspaceId}:${month}`) ?? 0;
    }

    async listActiveCloudWorkspaceIds(): Promise<readonly string[]> {
        return [...this.activeIds];
    }
}

function monthKeyFromDate(d: Date): string {
    const y = d.getUTCFullYear();
    const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
    return `${y}-${m}`;
}
