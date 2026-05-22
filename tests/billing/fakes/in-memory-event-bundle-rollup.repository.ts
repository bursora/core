import type { EventBundleRollupRepository } from "@/lib/ee/billing/workspace-billing.repository";

export class InMemoryEventBundleRollupRepository implements EventBundleRollupRepository {
    private readonly counts = new Map<string, number>();

    seed(input: { workspaceId: string; month: string; eventsCount: number }): void {
        this.counts.set(`${input.workspaceId}:${input.month}`, input.eventsCount);
    }

    async findEventsCount(input: { workspaceId: string; month: string }): Promise<number> {
        return this.counts.get(`${input.workspaceId}:${input.month}`) ?? 0;
    }
}
