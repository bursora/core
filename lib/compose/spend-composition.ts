import { clickhouseClient, type ClickHouse } from "@/lib/clickhouse/client";
import { withRequestMemo } from "@/lib/dashboard/per-request-cache";
import {
    composeSpend,
    type CustomerComposition,
    type RawCompositionRow,
} from "@/lib/spend-composition/compute";
import "server-only";

const TOP_N = 3;

interface GetSpendCompositionInput {
    readonly workspaceId: string;
    readonly from: Date;
    readonly to: Date;
}

interface CompositionRow {
    tenant_id: string;
    model: string;
    cost: string | null;
}

/**
 * Per-(tenant, model) cost rollup for the customer composition panel. Reads the
 * canonical ClickHouse store: `status='ok'` rows in `[from, to)`, restricted to
 * tagged tenants (`tenant_id != ''`, the CH twin of the PG `IS NOT NULL`).
 * Untagged-model rows are dropped client-side, mirroring the PG repo's skip of
 * null models. Money stays a string over the wire (`toString(sum(cost_usd))`)
 * then parses to a float for the pure `composeSpend` reducer.
 */
export async function fetchSpendCompositionRows(
    ch: ClickHouse,
    input: GetSpendCompositionInput,
): Promise<RawCompositionRow[]> {
    const rows = await ch.query<CompositionRow>({
        query: `SELECT
                tenant_id,
                model,
                toString(sum(cost_usd)) AS cost
            FROM usage_events
            WHERE workspace_id = {workspaceId:UUID}
                AND status = 'ok'
                AND tenant_id != ''
                AND toUnixTimestamp64Milli(ts) >= {fromMs:Int64}
                AND toUnixTimestamp64Milli(ts) < {toMs:Int64}
            GROUP BY tenant_id, model`,
        query_params: {
            workspaceId: input.workspaceId,
            fromMs: input.from.getTime(),
            toMs: input.to.getTime(),
        },
    });

    const raw: RawCompositionRow[] = [];
    for (const r of rows) {
        if (r.model === "") continue;
        const cost = r.cost === null ? 0 : Number.parseFloat(r.cost);
        if (!Number.isFinite(cost)) continue;
        raw.push({ tenantId: r.tenant_id, model: r.model, costUsd: cost });
    }
    return raw;
}

async function getSpendCompositionImpl(
    input: GetSpendCompositionInput,
): Promise<readonly CustomerComposition[]> {
    const raw = await fetchSpendCompositionRows(clickhouseClient(), input);
    return composeSpend(raw, TOP_N);
}

export const getSpendComposition = withRequestMemo(getSpendCompositionImpl);
