/**
 * Drizzle-backed `TrackedSpendRepository`. Sums `usage_events.cost_usd`
 * for one workspace over a half-open month window, converting USD to
 * cents via Postgres-side multiplication so we don't lose precision in JS.
 *
 * `usage_events.cost_usd` is already pricing-override-adjusted at write
 * time, so the SUM here IS the override-adjusted total — the bill
 * calculator can multiply by 0.5% without any further accounting.
 *
 * Active workspaces are those with `stripe_customer_id IS NOT NULL` and
 * `subscription_status IN ('active', 'trialing', 'past_due')`. `unpaid`
 * is excluded — Stripe already retried and gave up. The rollup cron does
 * not push a second invoice on top of an unpaid one.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { and, eq, gte, inArray, isNotNull, lt, sql, sum } from "drizzle-orm";
import type { MonthlySpendQuery, TrackedSpendRepository } from "./tracked-spend.repository";

const ACTIVE_STATUSES = ["active", "trialing", "past_due"] as const;

export class DrizzleTrackedSpendRepository implements TrackedSpendRepository {
    constructor(private readonly db: Db) {}

    async sumMonthlySpendCents(query: MonthlySpendQuery): Promise<number> {
        const [row] = await this.db
            .select({ total: sum(schema.usageEvents.costUsd) })
            .from(schema.usageEvents)
            .where(
                and(
                    eq(schema.usageEvents.workspaceId, query.workspaceId),
                    gte(schema.usageEvents.ts, query.from),
                    lt(schema.usageEvents.ts, query.to),
                    eq(schema.usageEvents.status, "ok"),
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
        const rows = await this.db
            .select({ id: schema.workspaces.id })
            .from(schema.workspaces)
            .where(
                and(
                    isNotNull(schema.workspaces.stripeCustomerId),
                    inArray(schema.workspaces.subscriptionStatus, [...ACTIVE_STATUSES]),
                ),
            )
            .orderBy(sql`${schema.workspaces.id} asc`);
        return rows.map((r) => r.id);
    }
}
