import { schema } from "@/lib/db";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { count, sql } from "drizzle-orm";
import { createTestDb, truncateAll, type TestDbHandle } from "./pglite-db";

let handle: TestDbHandle;

beforeAll(async () => {
    handle = await createTestDb();
});

afterAll(async () => {
    await handle.close();
});

test("migrations apply and a row round-trips through the drizzle client", async () => {
    const { db } = handle;

    const [inserted] = await db.insert(schema.workspaces).values({ name: "acme" }).returning();

    expect(inserted?.name).toBe("acme");
    expect(inserted?.environment).toBe("prod");

    const found = await db.select().from(schema.workspaces);
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBe(inserted!.id);
});

test("Postgres aggregates the metering repos rely on execute", async () => {
    const { db, pg } = handle;

    await truncateAll(pg);
    await db.insert(schema.workspaces).values([
        { name: "p", environment: "prod" },
        { name: "d", environment: "dev" },
    ]);

    // date_trunc + count(*) FILTER expressed through the drizzle builder, the
    // same way the metering repo writes its conditional aggregates.
    const [row] = await db
        .select({
            bucket: sql<string>`date_trunc('day', now())`,
            total: count(),
            oks: sql<number>`count(*) filter (where ${schema.workspaces.environment} = 'prod')`,
        })
        .from(schema.workspaces);

    expect(row?.bucket).toBeTruthy();
    expect(Number(row?.total)).toBe(2);
    expect(Number(row?.oks)).toBe(1);
});

test("truncateAll clears rows but keeps the schema", async () => {
    const { db, pg } = handle;

    await db.insert(schema.workspaces).values({ name: "to-be-wiped" });
    await truncateAll(pg);

    const remaining = await db.select().from(schema.workspaces);
    expect(remaining).toHaveLength(0);
});
