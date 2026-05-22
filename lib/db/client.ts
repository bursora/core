/**
 * Drizzle client. One process-wide postgres pool. Lazily constructed so test
 * code that imports use cases doesn't accidentally open connections.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

const GLOBAL_KEY = "__bursora_db__";

type Globals = typeof globalThis & {
    [GLOBAL_KEY]?: { sql: ReturnType<typeof postgres>; db: Db };
};

export function db(): Db {
    const g = globalThis as Globals;
    if (!g[GLOBAL_KEY]) {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error("DATABASE_URL is required");
        const sql = postgres(url, { max: 5, idle_timeout: 20 });
        g[GLOBAL_KEY] = { sql, db: drizzle(sql, { schema }) };
    }
    return g[GLOBAL_KEY].db;
}

export { schema };
