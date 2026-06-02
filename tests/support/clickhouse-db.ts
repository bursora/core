/**
 * ClickHouse integration-test harness. ClickHouse has no in-process engine like
 * PGlite, so instead of a fresh container per run we carve an ephemeral
 * *database* out of a live server (env `CLICKHOUSE_URL`), apply the `.sql`
 * migrations into it, hand back our typed `ClickHouse` client for the CH-adapter
 * repos to run real queries, then drop the database on teardown. This mirrors
 * `pglite-db.ts`: spin up an isolated store, apply real migrations, expose a
 * client, tear down.
 *
 * Migrations are read straight from `clickhouse/migrations/*.sql` (owned by the
 * migration-tooling slice). The folder is overridable so this harness can be
 * exercised against a fixtures dir before that slice lands.
 *
 * The harness client inserts synchronously (`async_insert=0`) so tests read
 * their own writes deterministically; production ingest stays async.
 */

import { createClickHouse, type ClickHouse } from "@/lib/clickhouse/client";
import type { ClickHouseConfig } from "@/lib/clickhouse/config";
import { createClient, type ClickHouseClient as NativeClient } from "@clickhouse/client";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MIGRATIONS_FOLDER = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../clickhouse/migrations",
);

/**
 * Connection config for the test server, read directly from `process.env` to
 * avoid coupling the harness to full app-env validation. Returns `null` when
 * `CLICKHOUSE_URL` is unset so suites can skip cleanly without a live server.
 */
export function clickhouseTestConfig(): ClickHouseConfig | null {
    const url = process.env.CLICKHOUSE_URL ?? "";
    if (url.length === 0) return null;
    return {
        url,
        username: process.env.CLICKHOUSE_USER ?? "default",
        password: process.env.CLICKHOUSE_PASSWORD ?? "",
        database: process.env.CLICKHOUSE_DATABASE ?? "default",
    };
}

export interface TestClickHouseHandle {
    /** Typed app client scoped to the ephemeral database. */
    ch: ClickHouse;
    /** Native client scoped to the ephemeral database, for DDL/truncate in setup. */
    native: NativeClient;
    /** Name of the ephemeral database. */
    database: string;
    /** Drop the database and close all connections. */
    close: () => Promise<void>;
}

export interface CreateTestClickHouseOptions {
    /** Folder of `.sql` migrations to apply. Defaults to `clickhouse/migrations`. */
    migrationsDir?: string;
}

export async function createTestClickHouse(
    options: CreateTestClickHouseOptions = {},
): Promise<TestClickHouseHandle> {
    const config = clickhouseTestConfig();
    if (!config) {
        throw new Error(
            "createTestClickHouse: CLICKHOUSE_URL is unset. Guard integration tests on clickhouseTestConfig() so they skip without a live server.",
        );
    }

    const database = `bursora_test_${randomUUID().replace(/-/g, "")}`;
    const credentials = { username: config.username, password: config.password };

    const admin = createClient({ url: config.url, database: config.database, ...credentials });
    await admin.command({ query: `CREATE DATABASE IF NOT EXISTS ${database}` });

    // Synchronous insert so integration tests read their own writes; the
    // production singleton keeps async_insert for non-blocking ingest.
    const native = createClient({
        url: config.url,
        database,
        ...credentials,
        clickhouse_settings: { async_insert: 0, wait_for_async_insert: 1 },
    });

    await applyMigrations(native, options.migrationsDir ?? DEFAULT_MIGRATIONS_FOLDER);

    return {
        ch: createClickHouse(native),
        native,
        database,
        close: async () => {
            await native.close();
            await admin.command({ query: `DROP DATABASE IF EXISTS ${database}` });
            await admin.close();
        },
    };
}

/**
 * Apply every `.sql` file in `folder`, lexically ordered, one statement at a
 * time (the native `command` runs a single statement). A missing folder is a
 * no-op so the harness stays usable before any migrations exist.
 */
async function applyMigrations(native: NativeClient, folder: string): Promise<void> {
    let entries: string[];
    try {
        entries = await readdir(folder);
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
        throw error;
    }
    for (const file of entries.filter((f) => f.endsWith(".sql")).sort()) {
        const sql = await readFile(join(folder, file), "utf8");
        for (const statement of splitStatements(sql)) {
            await native.command({ query: statement });
        }
    }
}

function splitStatements(sql: string): string[] {
    return sql
        .split(";")
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);
}

/**
 * Wipe every table in the ephemeral database between tests, leaving the schema
 * intact. Mirrors `truncateAll` for the pglite harness.
 */
export async function truncateTables(native: NativeClient, database: string): Promise<void> {
    const result = await native.query({
        query: "SELECT name FROM system.tables WHERE database = {db:String}",
        query_params: { db: database },
        format: "JSONEachRow",
    });
    const tables = await result.json<{ name: string }>();
    for (const { name } of tables) {
        await native.command({ query: `TRUNCATE TABLE ${database}.${name}` });
    }
}
