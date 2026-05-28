/**
 * Drizzle implementation of the retention repository.
 *
 * Two write paths:
 *   - row-level deletes per workspace (`deleteEventsOlderThan`)
 *   - whole-partition drops (`dropPartition`) — DETACH + DROP in a transaction
 *
 * Partition discovery walks `pg_inherits` joined with `pg_class` to find
 * partitions whose parent is `usage_events`. We derive bounds from the
 * partition name (`usage_events_YYYY_MM`) which the original migration's
 * naming scheme guarantees. Names are validated against `PARTITION_NAME_RE`
 * before any dynamic SQL fires.
 *
 * `pg_inherits` / `pg_class` are declared as Drizzle tables in the
 * `pg_catalog` schema so partition discovery uses the query builder. Row
 * counts go through the parent `usage_events` with a `ts` bounds filter —
 * Postgres partition pruning routes the count to the single partition that
 * matches those bounds, equivalent to the previous direct-table count.
 *
 * `dropPartition` is the one remaining place where `db.execute(sql\`\`)` is
 * unavoidable: Drizzle has no runtime DDL API for `ALTER TABLE ... DETACH
 * PARTITION` or `DROP TABLE`. Partition names are still validated against
 * `PARTITION_NAME_RE` and quoted via `sql.identifier`.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { usageEvents, workspaces } from "@/lib/db/schema";
import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import { alias, pgSchema, text } from "drizzle-orm/pg-core";
import type {
    PartitionInfo,
    RetentionRepository,
    WorkspaceRetention,
} from "./retention.repository";

const PARTITION_NAME_RE = /^usage_events_\d{4}_\d{2}$/;

// Minimal pg_catalog declarations for partition discovery. `oid` columns are
// modeled as text — Drizzle never binds values into them; it only emits
// column references for the JOIN, which Postgres evaluates with the real
// `oid` type.
const pgCatalog = pgSchema("pg_catalog");
const pgClass = pgCatalog.table("pg_class", {
    oid: text("oid").notNull(),
    relname: text("relname").notNull(),
});
const pgInherits = pgCatalog.table("pg_inherits", {
    inhrelid: text("inhrelid").notNull(),
    inhparent: text("inhparent").notNull(),
});

export const drizzleRetentionRepository = (db: Db): RetentionRepository => ({
    listWorkspaces: async () => {
        const rows = await db.select({ id: workspaces.id }).from(workspaces);
        return rows.map<WorkspaceRetention>((r) => ({ workspaceId: r.id }));
    },

    deleteEventsOlderThan: async (workspaceId, cutoffDate) => {
        const result = await db
            .delete(usageEvents)
            .where(and(eq(usageEvents.workspaceId, workspaceId), lt(usageEvents.ts, cutoffDate)));
        return rowCountFromResult(result);
    },

    listPartitionsOlderThan: async (cutoffDate) => {
        const parent = alias(pgClass, "parent");
        const child = alias(pgClass, "child");
        const rows = await db
            .select({ child: child.relname })
            .from(pgInherits)
            .innerJoin(parent, eq(parent.oid, pgInherits.inhparent))
            .innerJoin(child, eq(child.oid, pgInherits.inhrelid))
            .where(eq(parent.relname, "usage_events"));

        const out: PartitionInfo[] = [];
        for (const row of rows) {
            const name = row.child;
            if (!PARTITION_NAME_RE.test(name)) continue;
            const bounds = boundsFromPartitionName(name);
            if (bounds === null) continue;
            if (bounds.upperBound <= cutoffDate) {
                out.push({
                    partitionName: name,
                    lowerBound: bounds.lowerBound,
                    upperBound: bounds.upperBound,
                });
            }
        }
        return out;
    },

    countRowsInPartition: async (partitionName) => {
        if (!PARTITION_NAME_RE.test(partitionName)) {
            throw new Error(`invalid partition name: ${partitionName}`);
        }
        const bounds = boundsFromPartitionName(partitionName);
        if (bounds === null) {
            throw new Error(`invalid partition name: ${partitionName}`);
        }
        // Count via the parent table with the partition's ts range. Postgres
        // partition pruning routes this to the single matching partition.
        const [row] = await db
            .select({ count: count() })
            .from(usageEvents)
            .where(
                and(gte(usageEvents.ts, bounds.lowerBound), lt(usageEvents.ts, bounds.upperBound)),
            );
        return row?.count ?? 0;
    },

    dropPartition: async (partitionName) => {
        if (!PARTITION_NAME_RE.test(partitionName)) {
            throw new Error(`invalid partition name: ${partitionName}`);
        }
        // DDL — Drizzle has no runtime builder for ALTER/DROP. Identifier is
        // quoted by `sql.identifier`; name was validated above.
        await db.transaction(async (tx) => {
            await tx.execute(
                sql`ALTER TABLE usage_events DETACH PARTITION ${sql.identifier(partitionName)}`,
            );
            await tx.execute(sql`DROP TABLE ${sql.identifier(partitionName)}`);
        });
    },
});

interface PartitionBounds {
    readonly lowerBound: Date;
    readonly upperBound: Date;
}

const boundsFromPartitionName = (name: string): PartitionBounds | null => {
    // name shape: usage_events_YYYY_MM
    const parts = name.split("_");
    // ['usage', 'events', 'YYYY', 'MM']
    const yearStr = parts[2];
    const monthStr = parts[3];
    if (yearStr === undefined || monthStr === undefined) return null;
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
    if (month < 1 || month > 12) return null;
    const lowerBound = new Date(Date.UTC(year, month - 1, 1));
    const upperBound = new Date(Date.UTC(year, month, 1));
    return { lowerBound, upperBound };
};

const rowCountFromResult = (result: unknown): number => {
    // postgres-js returns an array-like with `.count` for write queries.
    if (typeof result === "object" && result !== null && "count" in result) {
        const count = (result as { count: unknown }).count;
        if (typeof count === "number") return count;
        if (typeof count === "string") return Number.parseInt(count, 10);
    }
    return 0;
};
