/**
 * In-memory PGlite-backed Drizzle test harness. Boots a fresh WASM Postgres,
 * applies the real `drizzle/migrations`, and hands back a Drizzle client typed
 * with the app schema so the production repos run under plain `bun test` with
 * no external Postgres.
 *
 * The production migrations use two contrib extensions (pgcrypto for
 * `gen_random_uuid`, btree_gist for the `pricing` EXCLUDE constraint); both are
 * preloaded into PGlite so `CREATE EXTENSION` resolves.
 */

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { drizzle } from "drizzle-orm/pglite";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type TestDb = Db;

const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle/migrations");
const STATEMENT_BREAKPOINT = /-->\s*statement-breakpoint/g;

interface Journal {
    entries: { tag: string }[];
}

/**
 * Apply migrations through PGlite's simple-query protocol (`pg.exec`) rather
 * than drizzle's migrator. The migrator drives the extended protocol one
 * statement at a time, which rejects the multi-statement extensions migration
 * and any DO/plpgsql block; `exec` runs a whole SQL script in one shot.
 */
async function applyMigrations(pg: PGlite): Promise<void> {
    const raw = await readFile(join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8");
    const journal: Journal = JSON.parse(raw);
    for (const entry of journal.entries) {
        const file = await readFile(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), "utf8");
        await pg.exec(file.replace(STATEMENT_BREAKPOINT, ""));
    }
}

export interface TestDbHandle {
    db: TestDb;
    pg: PGlite;
    close: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDbHandle> {
    const pg = await PGlite.create({ extensions: { btree_gist, pgcrypto } });
    await applyMigrations(pg);
    // The usage_events migration only provisions 13 monthly partitions from
    // `date_trunc('month', now())`, so a fresh boot rejects any ts outside the
    // current+12 months — which would make fixed test timestamps fail once the
    // wall clock rolls past them. A catch-all DEFAULT partition keeps inserts
    // valid for any ts regardless of when the suite runs.
    await pg.exec(`CREATE TABLE usage_events_default PARTITION OF "usage_events" DEFAULT`);
    // PGlite is a real Postgres engine; its drizzle client differs from the
    // postgres-js `Db` only in the phantom driver generic, so the cast is sound
    // at runtime. Single legitimate driver-bridge cast — keeps test files clean.
    const db: Db = drizzle(pg, { schema }) as unknown as Db;
    return { db, pg, close: () => pg.close() };
}

/**
 * Wipe every row from the public schema between tests. Truncates all base
 * tables in one statement (CASCADE follows partitions and FKs); the drizzle
 * migration ledger lives in the `drizzle` schema and is left intact.
 *
 * Runs through the raw PGlite client rather than the drizzle `db`: the two
 * drivers' `execute` return shapes diverge (PGlite yields `{ rows }`,
 * postgres-js yields a `RowList`), and `TestDb` is typed as the postgres-js
 * `Db` so the repos type-check. `pg.query`/`pg.exec` keep this path honest.
 */
export async function truncateAll(pg: PGlite): Promise<void> {
    const { rows } = await pg.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    if (rows.length === 0) return;
    const list = rows.map((r) => `"${r.tablename.replace(/"/g, '""')}"`).join(", ");
    await pg.exec(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
