/**
 * Retention promise guard.
 *
 * `CLOUD_RETENTION_DAYS` is the documented number; the ClickHouse table TTL is
 * what actually enforces it. This test reads the real DDL and asserts the two
 * agree, so the constant can't silently drift from the enforced window.
 */

import { CLOUD_RETENTION_DAYS } from "@/lib/metering";
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DDL_PATH = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../clickhouse/migrations/0001_usage_events.sql",
);

const TTL_RE = /TTL\s+toDateTime\(ts\)\s*\+\s*INTERVAL\s+(\d+)\s+DAY/i;

describe("retention policy", () => {
    test("CLOUD_RETENTION_DAYS matches the ClickHouse table TTL", async () => {
        const ddl = await readFile(DDL_PATH, "utf8");
        const match = ddl.match(TTL_RE);

        expect(match).not.toBeNull();
        expect(Number(match![1])).toBe(CLOUD_RETENTION_DAYS);
    });
});
