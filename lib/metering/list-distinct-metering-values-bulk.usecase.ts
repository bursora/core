/**
 * listDistinctMeteringValuesBulk — same shape as the per-scope use case but
 * for several scopes at once. Powers dashboard pages that show filter pills
 * for every facet (provider, tenant, agent, workflow, model). One round trip
 * instead of five.
 */

import type {
    DistinctValuesByScope,
    MeteringReadRepository,
    MeteringStatusFilter,
    ScopeKind,
} from "./metering-read.repository";

const SINCE_DAYS = 30;
const LIMIT = 50;

export interface ListDistinctMeteringValuesBulkInput {
    readonly workspaceId: string;
    readonly scopes: readonly ScopeKind[];
    readonly now: Date;
    readonly repo: MeteringReadRepository;
    readonly status?: MeteringStatusFilter | undefined;
}

export async function listDistinctMeteringValuesBulkUseCase(
    input: ListDistinctMeteringValuesBulkInput,
): Promise<DistinctValuesByScope> {
    return input.repo.listDistinctValuesBulk({
        workspaceId: input.workspaceId,
        scopes: input.scopes,
        sinceDays: SINCE_DAYS,
        limit: LIMIT,
        now: input.now,
        status: input.status,
    });
}
