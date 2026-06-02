import { clickHouseConfig } from "@/lib/clickhouse/config";
import { describe, expect, test } from "bun:test";

const ENV = {
    CLICKHOUSE_URL: "http://ch:8123",
    CLICKHOUSE_USER: "bursora",
    CLICKHOUSE_PASSWORD: "secret",
    CLICKHOUSE_DATABASE: "events",
};

describe("clickHouseConfig", () => {
    test("maps env to the native connection shape", () => {
        expect(clickHouseConfig(ENV)).toEqual({
            url: "http://ch:8123",
            username: "bursora",
            password: "secret",
            database: "events",
        });
    });

    test("throws a clear error when CLICKHOUSE_URL is empty", () => {
        expect(() => clickHouseConfig({ ...ENV, CLICKHOUSE_URL: "" })).toThrow(/CLICKHOUSE_URL/);
    });
});
