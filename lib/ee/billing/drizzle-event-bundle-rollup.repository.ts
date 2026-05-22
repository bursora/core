/**
 * Thin reader over `workspace_event_bundle_usage` for the billing
 * rollup. The richer cold-store reader lives in `lib/event-bundle/`
 * for the live banner; billing needs only the month event count.
 *
 * Keeping the billing-side reader separate avoids a billing → event-
 * bundle dependency edge that would otherwise tie the two features
 * together at the type level.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import type { EventBundleRollupRepository } from "./workspace-billing.repository";

export class DrizzleEventBundleRollupRepository implements EventBundleRollupRepository {
    constructor(private readonly db: Db) {}

    async findEventsCount(input: { workspaceId: string; month: string }): Promise<number> {
        const [row] = await this.db
            .select({ count: schema.workspaceEventBundleUsage.eventsCount })
            .from(schema.workspaceEventBundleUsage)
            .where(
                and(
                    eq(schema.workspaceEventBundleUsage.workspaceId, input.workspaceId),
                    eq(schema.workspaceEventBundleUsage.month, input.month),
                ),
            )
            .limit(1);
        return row?.count ?? 0;
    }
}
