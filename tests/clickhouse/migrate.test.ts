import {
    applyMigrations,
    dropAllTables,
    loadMigrations,
    splitStatements,
} from "@/clickhouse/migrate";
import type { ClickHouse, ClickHouseInsert, ClickHouseQuery } from "@/lib/clickhouse/client";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface RecordingCh {
    ch: ClickHouse;
    statements: string[];
    applied: Set<string>;
}

const SELECT_APPLIED = /SELECT\s+version\s+FROM\s+schema_migrations/i;
const CREATE_TRACKING = /CREATE TABLE IF NOT EXISTS schema_migrations/i;

/** In-memory ClickHouse stand-in: answers the applied-versions query from a set
 *  inserts mutate, and every other query is recorded as an executed statement. */
function createRecordingCh(initialApplied: string[] = []): RecordingCh {
    const applied = new Set(initialApplied);
    const statements: string[] = [];
    const ch: ClickHouse = {
        async query<Row>({ query }: ClickHouseQuery): Promise<Row[]> {
            if (SELECT_APPLIED.test(query)) {
                return [...applied].map((version) => ({ version })) as Row[];
            }
            statements.push(query.trim());
            return [] as Row[];
        },
        async insert<Row>({ table, values }: ClickHouseInsert<Row>): Promise<void> {
            if (table === "schema_migrations") {
                for (const row of values as readonly { version: string }[]) {
                    applied.add(row.version);
                }
            }
        },
        async ping(): Promise<void> {},
    };
    return { ch, statements, applied };
}

describe("splitStatements", () => {
    test("splits on semicolons, trims, drops blanks", () => {
        const sql = "CREATE TABLE a (x Int);\n\n  ALTER TABLE a ADD COLUMN y Int;\n";
        expect(splitStatements(sql)).toEqual([
            "CREATE TABLE a (x Int)",
            "ALTER TABLE a ADD COLUMN y Int",
        ]);
    });

    test("returns a single statement when there is no trailing semicolon", () => {
        expect(splitStatements("SELECT 1")).toEqual(["SELECT 1"]);
    });
});

describe("applyMigrations", () => {
    test("ensures the tracking table, applies pending in order, records versions", async () => {
        const { ch, statements, applied } = createRecordingCh();

        const result = await applyMigrations(ch, [
            { version: "0001_a", sql: "CREATE TABLE a (x Int)" },
            { version: "0002_b", sql: "CREATE TABLE b (x Int)" },
        ]);

        expect(result).toEqual(["0001_a", "0002_b"]);
        expect(statements.some((s) => CREATE_TRACKING.test(s))).toBe(true);
        const ddl = statements.filter((s) => !CREATE_TRACKING.test(s));
        expect(ddl).toEqual(["CREATE TABLE a (x Int)", "CREATE TABLE b (x Int)"]);
        expect([...applied].sort()).toEqual(["0001_a", "0002_b"]);
    });

    test("re-running with nothing pending is a no-op", async () => {
        const { ch, statements } = createRecordingCh(["0001_a"]);

        const result = await applyMigrations(ch, [
            { version: "0001_a", sql: "CREATE TABLE a (x Int)" },
        ]);

        expect(result).toEqual([]);
        expect(statements.filter((s) => !CREATE_TRACKING.test(s))).toEqual([]);
    });

    test("applies only the pending subset", async () => {
        const { ch, statements } = createRecordingCh(["0001_a"]);

        const result = await applyMigrations(ch, [
            { version: "0001_a", sql: "CREATE TABLE a (x Int)" },
            { version: "0002_b", sql: "CREATE TABLE b (x Int)" },
        ]);

        expect(result).toEqual(["0002_b"]);
        expect(statements.filter((s) => !CREATE_TRACKING.test(s))).toEqual([
            "CREATE TABLE b (x Int)",
        ]);
    });

    test("runs every statement in a multi-statement migration", async () => {
        const { ch, statements } = createRecordingCh();

        await applyMigrations(ch, [
            { version: "0001_multi", sql: "CREATE TABLE a (x Int);\nCREATE TABLE b (x Int);" },
        ]);

        expect(statements.filter((s) => !CREATE_TRACKING.test(s))).toEqual([
            "CREATE TABLE a (x Int)",
            "CREATE TABLE b (x Int)",
        ]);
    });
});

describe("dropAllTables", () => {
    const LIST_TABLES = /SELECT\s+name\s+FROM\s+system\.tables/i;

    test("drops every table the configured database reports", async () => {
        const dropped: string[] = [];
        const ch: ClickHouse = {
            async query<Row>({ query }: ClickHouseQuery): Promise<Row[]> {
                if (LIST_TABLES.test(query)) {
                    return [{ name: "usage_events" }, { name: "schema_migrations" }] as Row[];
                }
                dropped.push(query.trim());
                return [] as Row[];
            },
            async insert(): Promise<void> {},
            async ping(): Promise<void> {},
        };

        await dropAllTables(ch);

        expect(dropped).toEqual([
            "DROP TABLE IF EXISTS usage_events",
            "DROP TABLE IF EXISTS schema_migrations",
        ]);
    });

    test("is a no-op when there are no tables", async () => {
        const dropped: string[] = [];
        const ch: ClickHouse = {
            async query<Row>({ query }: ClickHouseQuery): Promise<Row[]> {
                if (LIST_TABLES.test(query)) return [] as Row[];
                dropped.push(query.trim());
                return [] as Row[];
            },
            async insert(): Promise<void> {},
            async ping(): Promise<void> {},
        };

        await dropAllTables(ch);

        expect(dropped).toEqual([]);
    });
});

describe("loadMigrations", () => {
    let dir: string;

    beforeAll(async () => {
        dir = await mkdtemp(join(tmpdir(), "ch-migrate-"));
        await writeFile(join(dir, "0002_second.sql"), "CREATE TABLE b (x Int)");
        await writeFile(join(dir, "0001_first.sql"), "CREATE TABLE a (x Int)");
        await writeFile(join(dir, "notes.txt"), "ignored");
    });

    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    test("reads .sql files in lexical order, ignoring other files", async () => {
        const migrations = await loadMigrations(dir);
        expect(migrations).toEqual([
            { version: "0001_first", sql: "CREATE TABLE a (x Int)" },
            { version: "0002_second", sql: "CREATE TABLE b (x Int)" },
        ]);
    });
});
