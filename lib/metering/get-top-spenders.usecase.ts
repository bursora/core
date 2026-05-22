/**
 * getTopSpenders — read-side orchestrator for the top-spenders table.
 *
 * Aggregates cost_usd per facet value over the given `{from, to}` window,
 * sorted desc, truncated to `limit` rows. Null facet values are surfaced
 * under the `(untagged)` literal so customers can find call sites that
 * forgot to pass tags.
 */

import { deriveWindow } from "./get-spend-series.usecase";
import type {
    MeteringFilters,
    MeteringReadRepository,
    MeteringStatusFilter,
} from "./metering-read.repository";
import type { Facet } from "./spend-series";
import { UNTAGGED } from "./spend-series";
import type { TopSpender } from "./top-spender";

export interface GetTopSpendersInput extends MeteringFilters {
    readonly workspaceId: string;
    readonly facet: Facet;
    readonly from: Date;
    readonly to: Date;
    readonly limit: number;
    readonly repo: MeteringReadRepository;
    readonly scopeId?: string | undefined;
    readonly status?: MeteringStatusFilter | undefined;
}

export async function getTopSpendersUseCase(
    input: GetTopSpendersInput,
): Promise<readonly TopSpender[]> {
    const { windowStart, windowEnd } = deriveWindow({ from: input.from, to: input.to });

    const rows = await input.repo.topSpenders({
        workspaceId: input.workspaceId,
        facet: input.facet,
        windowStart,
        windowEnd,
        limit: input.limit,
        scopeId: input.scopeId,
        status: input.status,
        provider: input.provider,
        tenantId: input.tenantId,
        agentId: input.agentId,
        workflowId: input.workflowId,
        model: input.model,
    });

    return rows.map((r) => ({
        tag: r.tag === null ? UNTAGGED : r.tag,
        costUsd: r.costUsd,
        callCount: r.callCount,
        blockedCount: r.blockedCount,
    }));
}
