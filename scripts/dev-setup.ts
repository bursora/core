/**
 * One-shot local dev setup. Wipes the DB, applies migrations, seeds pricing,
 * then mints a dev user + workspace + API key and writes the key into
 * `sdk/playground/.env` so the playground is ready to run.
 *
 * Not part of the app build. Run once after `git clone`, or any time you want
 * a clean slate:
 *
 *   bun scripts/dev-setup.ts
 */

import { apiKeys, users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { hashApiKey } from "@/lib/identity/api-key.crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const bursoraRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(bursoraRoot, "..");

function run(cmd: string, args: readonly string[]): void {
    const result = spawnSync(cmd, args, { stdio: "inherit", cwd: bursoraRoot });
    if (result.status !== 0) {
        throw new Error(`${cmd} ${args.join(" ")} failed with status ${result.status}`);
    }
}

run("bun", ["run", "db:fresh"]);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
const PEPPER = process.env.BURSORA_API_KEY_PEPPER;
if (!PEPPER) throw new Error("BURSORA_API_KEY_PEPPER is required");
const CRON_SECRET = process.env.CRON_SECRET;
if (!CRON_SECRET) throw new Error("CRON_SECRET is required");

const sql = postgres(DATABASE_URL);
const db = drizzle(sql);

const [user] = await db
    .insert(users)
    .values({ email: "dev@bursora.local", name: "Dev User", emailVerified: true, role: "admin" })
    .returning();
if (!user) throw new Error("failed to insert user");

const [workspace] = await db.insert(workspaces).values({ name: "Playground" }).returning();
if (!workspace) throw new Error("failed to insert workspace");

await db
    .insert(workspaceMembers)
    .values({ workspaceId: workspace.id, userId: user.id, role: "owner" });

const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");
const plaintext = `bsk_${workspace.id}_${secret}`;
const keyHash = hashApiKey(plaintext, PEPPER);

await db.insert(apiKeys).values({ workspaceId: workspace.id, keyHash, name: "playground" });

const playgroundDir = resolve(repoRoot, "sdk", "playground");
const envPath = resolve(playgroundDir, ".env");
if (!existsSync(envPath)) {
    copyFileSync(resolve(playgroundDir, ".env.example"), envPath);
}

function upsertEnv(source: string, key: string, value: string): string {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    return pattern.test(source)
        ? source.replace(pattern, line)
        : `${source.replace(/\n?$/, "\n")}${line}\n`;
}

let updated = readFileSync(envPath, "utf8");
updated = upsertEnv(updated, "BURSORA_API_KEY", plaintext);
updated = upsertEnv(updated, "BURSORA_CRON_SECRET", CRON_SECRET);
writeFileSync(envPath, updated);

const extraEnvPath = process.env.BURSORA_DEV_KEY_SYNC_PATH;
if (extraEnvPath) {
    const resolved = resolve(repoRoot, extraEnvPath);
    if (existsSync(resolved)) {
        const extraExisting = readFileSync(resolved, "utf8");
        const extraUpdated = extraExisting.replace(
            /^BURSORA_API_KEY=.*$/m,
            `BURSORA_API_KEY=${plaintext}`,
        );
        writeFileSync(resolved, extraUpdated);
        console.log(`  api key also written to ${resolved}`);
    } else {
        console.warn(`  BURSORA_DEV_KEY_SYNC_PATH set but file not found: ${resolved}`);
    }
}

console.log(`\n✓ Dev setup complete`);
console.log(`  user=${user.id}`);
console.log(`  email=${user.email}`);
console.log(`  workspace=${workspace.id}`);
console.log(`  api key written to sdk/playground/.env`);
console.log(`  key=${plaintext}`);

await sql.end();
