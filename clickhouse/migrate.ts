/**
 * Versioned ClickHouse migration runner. Applies the `.sql` files under
 * `clickhouse/migrations/` in lexical order, tracking applied versions in a
 * ClickHouse `schema_migrations` table so re-runs skip what's already done.
 *
 * Hand-rolled rather than a third-party lib to avoid a new dependency: each
 * file is one version (filename without `.sql`), statements split on `;`.
 *
 * Runs as a plain Bun script, so it reads `CLICKHOUSE_*` straight from the
 * environment and builds its own client off the `server-only`-free adapter
 * rather than the app singleton (whose `server-only`/full-env coupling can't
 * load outside the React Server Components condition). Inserts run synchronously
 * so a recorded version is durable before exit and a re-run sees it (idempotent).
 *
 * Run: `bun clickhouse/migrate.ts` (wired as `db:ch-migrate`).
 *   `--ensure-db`  CREATE DATABASE IF NOT EXISTS, then exit (wired into db:setup)
 *   `--fresh`      drop every table then re-apply (wired into db:fresh)
 */

import { createClickHouse, type ClickHouse } from "@/lib/clickhouse/adapter";
import { createClient } from "@clickhouse/client";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

interface ClickHouseEnvConfig {
    readonly url: string;
    readonly username: string;
    readonly password: string;
    readonly database: string;
}

export interface Migration {
    readonly version: string;
    readonly sql: string;
}

const SCHEMA_MIGRATIONS = "schema_migrations";

/** MergeTree keyed by version; the daily-ish migrate run tolerates async insert. */
const ENSURE_TRACKING_TABLE = `CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS} (
    version String,
    applied_at DateTime DEFAULT now()
) ENGINE = MergeTree ORDER BY version`;

/** Split a migration file into individual statements on `;`, dropping blanks. */
export function splitStatements(sql: string): string[] {
    return sql
        .split(";")
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);
}

/** Read `.sql` files from `dir` in lexical order; version is the basename. */
export async function loadMigrations(dir: string): Promise<Migration[]> {
    const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();
    return Promise.all(
        files.map(async (name) => ({
            version: name.slice(0, -".sql".length),
            sql: (await readFile(join(dir, name), "utf8")).trim(),
        })),
    );
}

/**
 * Apply every migration whose version isn't already recorded, in array order,
 * recording each version after its statements run. Returns the versions applied
 * this call; empty when nothing was pending.
 */
export async function applyMigrations(
    ch: ClickHouse,
    migrations: readonly Migration[],
): Promise<string[]> {
    await ch.query({ query: ENSURE_TRACKING_TABLE });
    const rows = await ch.query<{ version: string }>({
        query: `SELECT version FROM ${SCHEMA_MIGRATIONS}`,
    });
    const applied = new Set(rows.map((row) => row.version));

    const pending = migrations.filter((migration) => !applied.has(migration.version));
    for (const migration of pending) {
        for (const statement of splitStatements(migration.sql)) {
            await ch.query({ query: statement });
        }
        await ch.insert({ table: SCHEMA_MIGRATIONS, values: [{ version: migration.version }] });
    }
    return pending.map((migration) => migration.version);
}

/** Read ClickHouse connection settings from the environment. Mirrors the empty
 *  `CLICKHOUSE_URL` guard the app config uses so an unset URL fails clearly. */
function clickhouseEnvConfig(): ClickHouseEnvConfig {
    const url = process.env.CLICKHOUSE_URL ?? "";
    if (url.length === 0) {
        throw new Error(
            "ch-migrate: CLICKHOUSE_URL is empty; set it to the ClickHouse HTTP endpoint (e.g. http://localhost:8123).",
        );
    }
    return {
        url,
        username: process.env.CLICKHOUSE_USER ?? "default",
        password: process.env.CLICKHOUSE_PASSWORD ?? "",
        database: process.env.CLICKHOUSE_DATABASE ?? "default",
    };
}

/** Migration client scoped to the target database, inserting synchronously so a
 *  recorded version is durable before the process exits (idempotent re-runs). */
function migrateClient(config: ClickHouseEnvConfig): ClickHouse {
    return createClickHouse(
        createClient({
            url: config.url,
            username: config.username,
            password: config.password,
            database: config.database,
            clickhouse_settings: { async_insert: 0, wait_for_async_insert: 1 },
        }),
    );
}

/**
 * `CREATE DATABASE IF NOT EXISTS` for the configured `CLICKHOUSE_DATABASE` so a
 * clean machine has the target database before migrations apply. Connects to
 * the server's always-present `default` database since the target may not exist
 * yet. The Postgres counterpart is `drizzle/setup.ts`.
 */
async function ensureDatabase(config: ClickHouseEnvConfig): Promise<void> {
    const admin = createClickHouse(
        createClient({
            url: config.url,
            username: config.username,
            password: config.password,
            database: "default",
        }),
    );
    await admin.query({ query: `CREATE DATABASE IF NOT EXISTS ${config.database}` });
}

/**
 * Drop every table in the configured database so `--fresh` re-applies from a
 * clean slate. Dropping `schema_migrations` is what forces the full re-apply.
 * Matches the Postgres `--fresh` semantics: wipe, then re-provision.
 */
export async function dropAllTables(ch: ClickHouse): Promise<void> {
    const rows = await ch.query<{ name: string }>({
        query: "SELECT name FROM system.tables WHERE database = currentDatabase()",
    });
    for (const { name } of rows) {
        await ch.query({ query: `DROP TABLE IF EXISTS ${name}` });
    }
}

async function main(): Promise<void> {
    const config = clickhouseEnvConfig();

    if (process.argv.includes("--ensure-db")) {
        await ensureDatabase(config);
        return;
    }

    const ch = migrateClient(config);
    if (process.argv.includes("--fresh")) {
        await ensureDatabase(config);
        await dropAllTables(ch);
    }

    const migrations = await loadMigrations(join(import.meta.dir, "migrations"));
    const applied = await applyMigrations(ch, migrations);
    if (applied.length === 0) {
        console.log("ch-migrate: nothing pending");
        return;
    }
    for (const version of applied) {
        console.log(`ch-migrate: applied ${version}`);
    }
}

if (import.meta.main) {
    await main();
}
