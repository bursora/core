import { withRequestMemo } from "@/lib/dashboard/per-request-cache";
import { db, schema } from "@/lib/db";
import {
    composeSpend,
    type CustomerComposition,
    type RawCompositionRow,
} from "@/lib/spend-composition/compute";
import { and, eq, gte, isNotNull, lt, sum } from "drizzle-orm";
import "server-only";

const TOP_N = 3;

interface GetSpendCompositionInput {
    readonly workspaceId: string;
    readonly from: Date;
    readonly to: Date;
}

async function getSpendCompositionImpl(
    input: GetSpendCompositionInput,
): Promise<readonly CustomerComposition[]> {
    const rows = await db()
        .select({
            tenantId: schema.usageEvents.tenantId,
            model: schema.usageEvents.model,
            costUsd: sum(schema.usageEvents.costUsd),
        })
        .from(schema.usageEvents)
        .where(
            and(
                eq(schema.usageEvents.workspaceId, input.workspaceId),
                gte(schema.usageEvents.ts, input.from),
                lt(schema.usageEvents.ts, input.to),
                eq(schema.usageEvents.status, "ok"),
                isNotNull(schema.usageEvents.tenantId),
            ),
        )
        .groupBy(schema.usageEvents.tenantId, schema.usageEvents.model);

    const raw: RawCompositionRow[] = [];
    for (const r of rows) {
        if (r.tenantId === null || r.model === null) continue;
        const cost = r.costUsd === null ? 0 : Number.parseFloat(r.costUsd);
        if (!Number.isFinite(cost)) continue;
        raw.push({ tenantId: r.tenantId, model: r.model, costUsd: cost });
    }

    return composeSpend(raw, TOP_N);
}

export const getSpendComposition = withRequestMemo(getSpendCompositionImpl);
