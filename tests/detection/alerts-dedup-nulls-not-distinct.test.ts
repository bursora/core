/**
 * Regression lock for the `alerts_budget_crossing_uniq` partial unique index.
 *
 * The dedup index lives on `(workspace_id, scope_id, period_from) WHERE
 * kind = 'budget'`. `scope_id` is nullable; under Postgres' default
 * `NULLS DISTINCT` semantics, two rows with `scope_id = NULL` are treated as
 * distinct and the partial unique constraint does not dedupe them. That
 * lets workspace-scoped budget crossings double-insert despite
 * `recordBudgetCrossing` calling `onConflictDoNothing`.
 *
 * The fix is database-level: declare the index `NULLS NOT DISTINCT` so a
 * NULL `scope_id` is treated as equal to another NULL. This test asserts
 * the final shape of the index (the latest CREATE for that name in the
 * migrations folder) carries that clause.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "..", "drizzle", "migrations");
const INDEX_NAME = "alerts_budget_crossing_uniq";

function loadMigrations(): readonly { readonly file: string; readonly sql: string }[] {
    return readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), "utf8") }));
}

function latestCreateBlock(name: string): string | null {
    // Match a CREATE [UNIQUE] INDEX ... <name> ... up to the terminating
    // semicolon at end of line, across multiple lines.
    const pattern = new RegExp(
        String.raw`CREATE\s+(?:UNIQUE\s+)?INDEX[^;]*?\b${name}\b[^;]*;`,
        "gis",
    );
    let last: string | null = null;
    for (const { sql } of loadMigrations()) {
        const matches = sql.match(pattern);
        if (matches && matches.length > 0) {
            last = matches[matches.length - 1] ?? null;
        }
    }
    return last;
}

describe("alerts dedup index", () => {
    test("latest CREATE for alerts_budget_crossing_uniq declares NULLS NOT DISTINCT", () => {
        const block = latestCreateBlock(INDEX_NAME);
        expect(block).not.toBeNull();
        expect(block).toMatch(/NULLS\s+NOT\s+DISTINCT/i);
    });
});
