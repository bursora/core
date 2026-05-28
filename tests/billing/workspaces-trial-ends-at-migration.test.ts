/**
 * Regression lock for the `workspaces.trial_ends_at` column.
 *
 * The spend aggregator gates billing for `trialing` workspaces on whether
 * `trial_ends_at` is in the future or null. The column must exist as a
 * nullable `timestamptz` so the LS webhook handler can stamp it on
 * subscription activation and the rollup can compare it against `now`
 * without a separate join.
 *
 * Asserts on the latest CREATE/ALTER for that column in the migrations
 * folder, mirroring the regression style used by
 * `alerts-dedup-nulls-not-distinct.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "..", "drizzle", "migrations");

function loadMigrations(): readonly { readonly file: string; readonly sql: string }[] {
    return readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), "utf8") }));
}

describe("workspaces.trial_ends_at migration", () => {
    test("a migration adds trial_ends_at as a timestamptz column on workspaces", () => {
        const pattern =
            /ALTER\s+TABLE\s+"?workspaces"?\s+ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+"?trial_ends_at"?\s+timestamptz/i;
        const hit = loadMigrations().some(({ sql }) => pattern.test(sql));
        expect(hit).toBe(true);
    });

    test("_journal.json registers the trial_ends_at migration", () => {
        const journalPath = join(MIGRATIONS_DIR, "meta", "_journal.json");
        const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
            entries: ReadonlyArray<{ tag: string }>;
        };
        const tags = journal.entries.map((e) => e.tag);
        expect(tags.some((t) => /trial_ends_at/i.test(t))).toBe(true);
    });
});
