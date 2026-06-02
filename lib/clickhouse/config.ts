/**
 * ClickHouse connection config, derived from validated env. Splitting this out
 * keeps the required-var check pure and unit-testable without a live server.
 */

import "server-only";

import type { Env } from "../env";

export interface ClickHouseConfig {
    readonly url: string;
    readonly username: string;
    readonly password: string;
    readonly database: string;
}

type ClickHouseEnv = Pick<
    Env,
    "CLICKHOUSE_URL" | "CLICKHOUSE_USER" | "CLICKHOUSE_PASSWORD" | "CLICKHOUSE_DATABASE"
>;

export function clickHouseConfig(env: ClickHouseEnv): ClickHouseConfig {
    if (env.CLICKHOUSE_URL.length === 0) {
        throw new Error(
            "clickHouseConfig: CLICKHOUSE_URL is empty; set it to the ClickHouse HTTP endpoint (e.g. http://localhost:8123).",
        );
    }
    return {
        url: env.CLICKHOUSE_URL,
        username: env.CLICKHOUSE_USER,
        password: env.CLICKHOUSE_PASSWORD,
        database: env.CLICKHOUSE_DATABASE,
    };
}
