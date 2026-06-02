/**
 * Server-scoped ClickHouse singleton, built lazily from validated env so
 * importing this module never opens a connection — matching `lib/db` and
 * `lib/redis`. The connection surface lives in `./adapter`.
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
