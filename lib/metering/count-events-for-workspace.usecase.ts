/**
 * countEventsForWorkspace — read-side helper used by the dashboard's empty
 * state. Returns the number of usage events for the workspace, optionally
 * since a given timestamp.
 *
 * The dashboard needs to know "should I render the onboarding runbook or
 * the stats?" — a single integer is enough.
 */

import type {
    MeteringFilters,
    MeteringReadRepository,
    MeteringStatusFilter,
} from "./metering-read.repository";

export interface CountEventsForWorkspaceInput extends MeteringFilters {
    readonly workspaceId: string;
    readonly repo: MeteringReadRepository;
    readonly since?: Date;
    readonly status?: MeteringStatusFilter | undefined;
}

export async function countEventsForWorkspaceUseCase(
    input: CountEventsForWorkspaceInput,
): Promise<number> {
    const { repo, ...query } = input;
    return repo.countEvents(query);
}
