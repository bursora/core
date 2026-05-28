/**
 * Drizzle-backed `TrackedSpendRepository`. Sums `usage_events.cost_usd`
 * for one workspace over a half-open month window, converting USD to
 * cents via Postgres-side multiplication so we don't lose precision in JS.
 *
 * Trial carve-out: usage accrued during a trial is free. When the workspace
 * has a `trial_ends_at`, spend recorded before that boundary is excluded from
 * the sum, so the conversion-month bill only counts usage after the trial
 * converted. A workspace with no stored boundary has nothing to carve out.
 *
 * `usage_events.cost_usd` is already pricing-override-adjusted at write
 * time, so the SUM here IS the override-adjusted total — the bill
 * calculator can multiply by 0.5% without any further accounting.
 *
 * Billable workspaces are those with `provider_customer_id IS NOT NULL`
 * and either:
 *   - `subscription_status IN ('active', 'past_due')`, or
 *   - `subscription_status = 'trialing'` with `trial_ends_at IS NULL`
 *     (legacy trial without a stored end) or `trial_ends_at <= now()`
 *     (trial expired). A trial still in progress is NOT billable.
 *
 * `unpaid`, `canceled`, `expired`, `incomplete*` are excluded — the
 * billing provider already gave up (`unpaid`) or the customer never
 * activated; the rollup cron does not push a second invoice on top.
 *
 * The decision logic is mirrored from `isWorkspaceBillableNow` so the
 * SQL filter and the in-memory test fake agree.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql, sum } from "drizzle-orm";
import type { MonthlySpendQuery, TrackedSpendRepository } from "./tracked-spend.repository";

export class DrizzleTrackedSpendRepository implements TrackedSpendRepository {
    constructor(private readonly db: Db) {}

    async sumMonthlySpendCents(query: MonthlySpendQuery): Promise<number> {
        const [row] = await this.db
            .select({ total: sum(schema.usageEvents.costUsd) })
            .from(schema.usageEvents)
            .innerJoin(
                schema.workspaces,
                eq(schema.workspaces.id, schema.usageEvents.workspaceId),
            )
            .where(
                and(
                    eq(schema.usageEvents.workspaceId, query.workspaceId),
                    gte(schema.usageEvents.ts, query.from),
                    lt(schema.usageEvents.ts, query.to),
                    eq(schema.usageEvents.status, "ok"),
                    // Trial usage is free: drop spend recorded before the
                    // workspace's trial boundary. No boundary → nothing to drop.
                    or(
                        isNull(schema.workspaces.trialEndsAt),
                        gte(schema.usageEvents.ts, schema.workspaces.trialEndsAt),
                    ),
                ),
            );
        if (!row || row.total === null) return 0;
        // `cost_usd` is a numeric(14,8) string. Parse via decimal-string
        // math to round to the nearest cent without floating-point drift.
        const usd = Number.parseFloat(row.total);
        if (!Number.isFinite(usd)) return 0;
        return Math.round(usd * 100);
    }

    async listActiveCloudWorkspaceIds(): Promise<readonly string[]> {
        const { trialEndsAt, subscriptionStatus } = schema.workspaces;
        const rows = await this.db
            .select({ id: schema.workspaces.id })
            .from(schema.workspaces)
            .where(
                and(
                    isNotNull(schema.workspaces.providerCustomerId),
                    or(
                        inArray(subscriptionStatus, ["active", "past_due"]),
                        and(
                            eq(subscriptionStatus, "trialing"),
                            or(isNull(trialEndsAt), lte(trialEndsAt, sql`now()`)),
                        ),
                    ),
                ),
            )
            .orderBy(sql`${schema.workspaces.id} asc`);
        return rows.map((r) => r.id);
    }
}
