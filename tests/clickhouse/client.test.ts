import { clickHouseClientOptions, createClickHouse } from "@/lib/clickhouse/client";
import type { ClickHouseClient as NativeClient } from "@clickhouse/client";
import { describe, expect, test } from "bun:test";

const CONFIG = {
    url: "http://ch:8123",
    username: "bursora",
    password: "secret",
    database: "events",
};

interface FakeCalls {
    query: unknown[];
    insert: unknown[];
}

/** Minimal native stand-in recording the params it receives. */
function createFakeNative(
    overrides: Partial<Pick<NativeClient, "query" | "insert" | "ping">> = {},
): { native: NativeClient; calls: FakeCalls } {
    const calls: FakeCalls = { query: [], insert: [] };
    const fake = {
        query: async (params: unknown) => {
            calls.query.push(params);
            return { json: async () => [{ n: 1 }] };
        },
        insert: async (params: unknown) => {
            calls.insert.push(params);
            return {};
        },
        ping: async () => ({ success: true }),
        ...overrides,
    };
    return { native: fake as unknown as NativeClient, calls };
}

describe("clickHouseClientOptions", () => {
    test("applies async-insert defaults so ingest never blocks on merges", () => {
        const options = clickHouseClientOptions(CONFIG);
        expect(options.clickhouse_settings?.async_insert).toBe(1);
        expect(options.clickhouse_settings?.wait_for_async_insert).toBe(0);
        expect(options.url).toBe("http://ch:8123");
        expect(options.database).toBe("events");
    });
});

describe("createClickHouse", () => {
    test("query requests JSONEachRow and returns parsed rows", async () => {
        const { native, calls } = createFakeNative();
        const ch = createClickHouse(native);

        const rows = await ch.query<{ n: number }>({
            query: "SELECT 1 AS n",
            query_params: { x: 1 },
        });

        expect(rows).toEqual([{ n: 1 }]);
        expect(calls.query[0]).toEqual({
            query: "SELECT 1 AS n",
            query_params: { x: 1 },
            format: "JSONEachRow",
        });
    });

    test("insert sends JSONEachRow rows to the table", async () => {
        const { native, calls } = createFakeNative();
        const ch = createClickHouse(native);

        await ch.insert({ table: "usage_events", values: [{ id: "a" }] });

        expect(calls.insert[0]).toEqual({
            table: "usage_events",
            values: [{ id: "a" }],
            format: "JSONEachRow",
        });
    });

    test("ping resolves when ClickHouse is reachable", async () => {
        const { native } = createFakeNative();
        await expect(createClickHouse(native).ping()).resolves.toBeUndefined();
    });

    test("ping surfaces a clear error when ClickHouse is down", async () => {
        const { native } = createFakeNative({
            ping: async () => ({ success: false, error: new Error("ECONNREFUSED") }),
        });
        await expect(createClickHouse(native).ping()).rejects.toThrow(/ClickHouse.*ECONNREFUSED/);
    });
});
