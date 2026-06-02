/**
 * Pure ClickHouse adapter: wraps the native `@clickhouse/client` behind a small
 * typed surface (`query` returns parsed rows, `insert` writes rows, `ping`
 * checks connectivity).
 *
 * Split out from `client.ts` so it carries no `server-only` guard. The app
 * singleton (`client.ts`) and the migration CLI (`clickhouse/migrate.ts`) both
 * build on it; the CLI runs as a plain Bun script outside the React Server
 * Components condition, where a `server-only` import would throw.
 */

import type {
    ClickHouseClientConfigOptions,
    ClickHouseClient as NativeClient,
} from "@clickhouse/client";
import type { ClickHouseConfig } from "./config";

/** JSON-per-line wire format. Query rows come back parsed; inserts send rows. */
const FORMAT = "JSONEachRow" as const;

export interface ClickHouseQuery {
    query: string;
    query_params?: Record<string, unknown>;
}

export interface ClickHouseInsert<Row> {
    table: string;
    values: readonly Row[];
}

export interface ClickHouse {
    query<Row>(params: ClickHouseQuery): Promise<Row[]>;
    insert<Row>(params: ClickHouseInsert<Row>): Promise<void>;
    ping(): Promise<void>;
}

export function clickHouseClientOptions(config: ClickHouseConfig): ClickHouseClientConfigOptions {
    return {
        url: config.url,
        username: config.username,
        password: config.password,
        database: config.database,
        clickhouse_settings: { async_insert: 1, wait_for_async_insert: 0 },
    };
}

/** Adapt the native client to our surface. Exported for tests with a fake. */
export function createClickHouse(native: NativeClient): ClickHouse {
    return {
        async query<Row>({ query, query_params }: ClickHouseQuery): Promise<Row[]> {
            const result = await native.query({
                query,
                format: FORMAT,
                ...(query_params ? { query_params } : {}),
            });
            return result.json<Row>();
        },
        async insert<Row>({ table, values }: ClickHouseInsert<Row>): Promise<void> {
            await native.insert({ table, values, format: FORMAT });
        },
        async ping(): Promise<void> {
            const result = await native.ping();
            if (!result.success) {
                throw new Error(`ClickHouse unreachable: ${result.error.message}`);
            }
        },
    };
}
