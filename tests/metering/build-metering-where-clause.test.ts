/**
 * Unit tests for `buildMeteringWhereClause` — the single source of truth for
 * `usage_events` WHERE clauses across the metering read repo and the spend
 * aggregator. Tests assert predicate count + column identity by walking
 * Drizzle's SQL chunk graph; we deliberately avoid coupling to the chunk
 * encoding of bound parameters, which is Drizzle's concern.
 */

import { schema } from "@/lib/db";
import { buildMeteringWhereClause } from "@/lib/metering/usage-events-filters";
import { describe, expect, test } from "bun:test";
import { SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

/**
 * Recursively walk a SQL fragment's chunk graph and return every leaf chunk.
 * Drizzle composes predicates as nested SQL objects with `queryChunks`; the
 * leaves are the raw strings, column refs, and parameter wrappers we need
 * to assert against.
 */
function leafChunks(node: unknown): unknown[] {
    if (node instanceof SQL) {
        // queryChunks is the internal array of pieces; flatten by recursion
        const chunks = (node as unknown as { queryChunks: unknown[] }).queryChunks;
        return chunks.flatMap((c) => leafChunks(c));
    }
    return [node];
}

/** Find the parameter wrappers (`new Param(value)`) carried by a SQL fragment. */
function paramValues(node: unknown): unknown[] {
    return leafChunks(node).flatMap((c) => {
        if (c === null || typeof c !== "object") return [];
        const candidate = c as { value?: unknown; brand?: string };
        if ("value" in candidate && candidate.brand !== "SQL") return [candidate.value];
        return [];
    });
}

/** Find the column references inside a SQL fragment. */
function columnRefs(node: unknown): PgColumn[] {
    return leafChunks(node).filter(
        (c): c is PgColumn =>
            c !== null &&
            typeof c === "object" &&
            "name" in c &&
            "table" in c &&
            typeof (c as { name: unknown }).name === "string",
    );
}

describe("buildMeteringWhereClause", () => {
    test("workspace + status='ok' yields workspaceId and status predicates", () => {
        const conditions = buildMeteringWhereClause({
            workspaceId: WORKSPACE,
            status: "ok",
        });

        expect(conditions).toHaveLength(2);

        const [workspacePred, statusPred] = conditions as SQL[];
        expect(workspacePred).toBeInstanceOf(SQL);
        expect(statusPred).toBeInstanceOf(SQL);

        // workspaceId predicate references the workspaceId column with the
        // workspace UUID as a bound parameter.
        const workspaceCols = columnRefs(workspacePred);
        expect(workspaceCols).toContain(schema.usageEvents.workspaceId);
        expect(paramValues(workspacePred)).toContain(WORKSPACE);

        // status predicate references the status column and binds 'ok'.
        const statusCols = columnRefs(statusPred);
        expect(statusCols).toContain(schema.usageEvents.status);
        expect(paramValues(statusPred)).toContain("ok");
    });

    test("status='blocked' binds 'blocked' on the status predicate", () => {
        const conditions = buildMeteringWhereClause({
            workspaceId: WORKSPACE,
            status: "blocked",
        });

        expect(conditions).toHaveLength(2);
        const [, statusPred] = conditions as SQL[];
        expect(columnRefs(statusPred)).toContain(schema.usageEvents.status);
        expect(paramValues(statusPred)).toContain("blocked");
    });

    test("status='both' yields only the workspaceId predicate", () => {
        const conditions = buildMeteringWhereClause({
            workspaceId: WORKSPACE,
            status: "both",
        });

        expect(conditions).toHaveLength(1);
        // None of the produced predicates may reference the status column.
        for (const cond of conditions) {
            expect(columnRefs(cond)).not.toContain(schema.usageEvents.status);
        }
    });

    test("filters add one IN predicate per non-empty dimension; empty arrays are skipped", () => {
        const conditions = buildMeteringWhereClause({
            workspaceId: WORKSPACE,
            status: "both",
            filters: {
                provider: ["openai", "anthropic"],
                model: ["gpt-4o"],
                // Empty array — must NOT produce an `IN ()` predicate, which
                // would short-circuit to FALSE in Postgres.
                tenantId: [],
                // Undefined — same handling as empty.
                agentId: undefined,
                // Omitted — workflowId not present.
            },
        });

        // workspaceId + provider IN + model IN = 3 predicates.
        expect(conditions).toHaveLength(3);

        const providerPred = conditions.find((c) =>
            columnRefs(c).includes(schema.usageEvents.provider),
        );
        const modelPred = conditions.find((c) => columnRefs(c).includes(schema.usageEvents.model));

        expect(providerPred).toBeDefined();
        expect(modelPred).toBeDefined();

        // The column-ref check above pins which dimension each predicate
        // targets; we trust Drizzle's `inArray` helper to render an IN list
        // for the bound array. Re-checking the SQL serialization here would
        // couple the test to Drizzle's chunk encoding.

        // No predicate references tenantId/agentId/workflowId.
        for (const cond of conditions) {
            const cols = columnRefs(cond);
            expect(cols).not.toContain(schema.usageEvents.tenantId);
            expect(cols).not.toContain(schema.usageEvents.agentId);
            expect(cols).not.toContain(schema.usageEvents.workflowId);
        }
    });

    test("composes cleanly with drizzle `and(...)` — the array spreads into a valid SQL fragment", async () => {
        const { and } = await import("drizzle-orm");
        const conditions = buildMeteringWhereClause({
            workspaceId: WORKSPACE,
            status: "ok",
            filters: { provider: ["openai"] },
        });

        const combined = and(...conditions);
        expect(combined).toBeInstanceOf(SQL);
    });
});
