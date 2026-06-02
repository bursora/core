import { afterAll, beforeAll, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    clickhouseTestConfig,
    createTestClickHouse,
    truncateTables,
    type TestClickHouseHandle,
} from "./clickhouse-db";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures/clickhouse-migrations");
const hasClickHouse = clickhouseTestConfig() !== null;

let handle: TestClickHouseHandle;

beforeAll(async () => {
    if (!hasClickHouse) return;
    handle = await createTestClickHouse({ migrationsDir: FIXTURES });
});

afterAll(async () => {
    await handle?.close();
});

test.skipIf(!hasClickHouse)(
    "migration applies and a row round-trips through the client",
    async () => {
        await handle.ch.insert({ table: "smoke_events", values: [{ id: "a", amount: 5 }] });

        const rows = await handle.ch.query<{ id: string; amount: number }>({
            query: "SELECT id, amount FROM smoke_events ORDER BY id",
        });

        expect(rows).toEqual([{ id: "a", amount: 5 }]);
    },
);

test.skipIf(!hasClickHouse)("truncateTables clears rows but keeps the table", async () => {
    await handle.ch.insert({ table: "smoke_events", values: [{ id: "b", amount: 1 }] });
    await truncateTables(handle.native, handle.database);

    const rows = await handle.ch.query<{ id: string }>({ query: "SELECT id FROM smoke_events" });
    expect(rows).toHaveLength(0);
});
