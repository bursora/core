/**
 * getLastUsageEventAt: read-side helper used by the dashboard SDK heartbeat.
 *
 * Returns the timestamp of the most recent `usage_events` row for the
 * workspace, or `null` when the workspace has never recorded one. Wraps a
 * single repository call so the dashboard stays in the application layer.
 */

import type { MeteringReadRepository } from "./metering-read.repository";

export interface GetLastUsageEventAtInput {
    readonly workspaceId: string;
    readonly repo: MeteringReadRepository;
}

export async function getLastUsageEventAtUseCase(
    input: GetLastUsageEventAtInput,
): Promise<Date | null> {
    return input.repo.getLastUsageEventAt({ workspaceId: input.workspaceId });
}
