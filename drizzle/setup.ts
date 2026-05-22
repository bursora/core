/**
 * Provision the target Postgres database referenced by DATABASE_URL.
 *
 * Connects to the cluster's `postgres` admin DB, then creates the target
 * if missing. Pass `--fresh` to drop and recreate it (destructive — wipes
 * all data). Intended for local development and CI bootstrap only.
 *
 * Run: `bun drizzle/setup.ts [--fresh]`
 */

import postgres from "postgres";

async function main(): Promise<void> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error("DATABASE_URL is required");
    }

    const url = new URL(databaseUrl);
    const targetDb = url.pathname.replace(/^\//, "");
    if (!targetDb) {
        throw new Error("DATABASE_URL must include a database name");
    }

    const fresh = process.argv.includes("--fresh");
    url.pathname = "/postgres";
    const adminSql = postgres(url.toString(), { max: 1 });

    try {
        const rows = await adminSql<{ exists: boolean }[]>`
            SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${targetDb}) AS exists
        `;
        const exists = rows[0]?.exists ?? false;

        if (exists && fresh) {
            await adminSql.unsafe(`DROP DATABASE "${targetDb}" WITH (FORCE)`);
            console.log(`dropped database ${targetDb}`);
        }

        if (!exists || fresh) {
            await adminSql.unsafe(`CREATE DATABASE "${targetDb}"`);
            console.log(`created database ${targetDb}`);
            return;
        }

        console.log(`database ${targetDb} already exists`);
    } finally {
        await adminSql.end();
    }
}

await main();
