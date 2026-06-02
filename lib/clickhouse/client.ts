/**
 * Server-scoped ClickHouse singleton. The connection surface lives in
 * `./adapter` (no `server-only` guard); this module adds the lazy app
 * singleton built from validated env, plus a startup connectivity check.
 *
 * The singleton is constructed lazily so importing this module never opens a
 * connection — matching `lib/db` and `lib/redis`. The native `createClient`
 * is itself lazy, so the first real request is what reaches the server.
 *
 * Inserts default to `async_insert=1`, `wait_for_async_insert=0` so ingest
 * returns as soon as ClickHouse queues the rows instead of blocking on the
 * background merge.
 */

import "server-only";

import { createClient } from "@clickhouse/client";
import { env } from "../env";
import { clickHouseClientOptions, createClickHouse, type ClickHouse } from "./adapter";
import { clickHouseConfig } from "./config";

export * from "./adapter";

const GLOBAL_KEY = "__bursora_clickhouse__";

type Globals = typeof globalThis & {
    [GLOBAL_KEY]?: ClickHouse;
};

export function clickhouseClient(): ClickHouse {
    const g = globalThis as Globals;
    if (!g[GLOBAL_KEY]) {
        const native = createClient(clickHouseClientOptions(clickHouseConfig(env())));
        g[GLOBAL_KEY] = createClickHouse(native);
    }
    return g[GLOBAL_KEY];
}

/**
 * Startup connectivity check. Throws a clear error when ClickHouse is
 * unreachable so boot fails fast instead of on the first ingest.
 */
export async function checkClickHouseConnection(): Promise<void> {
    await clickhouseClient().ping();
}
