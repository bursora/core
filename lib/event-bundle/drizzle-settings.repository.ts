/**
 * Drizzle-backed `EventBundleSettingsRepository`. Wraps the
 * `workspace_event_bundle_settings` table. Absent rows surface as `null`
 * so callers can apply the default policy (no hard cap).
 *
 * `findByWorkspaceId` results sit in a process-local LRU (TTL 60s, capped
 * at 10k workspaces) so the events ingest path doesn't hit Postgres once
 * per request. Writes invalidate the cached entry for the workspace so the
 * dashboard's "save" reflects on the next call.
 */

import "server-only";

import { schema, type Db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { LruCache } from "../lru-cache";
import type { EventBundleSettings, EventBundleSettingsRepository } from "./types";

const TTL_MS = 60_000;
const MAX_ENTRIES = 10_000;

const cache = new LruCache<string, EventBundleSettings | null>(MAX_ENTRIES);

export function drizzleEventBundleSettingsRepository(db: Db): EventBundleSettingsRepository {
    return {
        async findByWorkspaceId(workspaceId) {
            const cached = cache.get(workspaceId);
            if (cached && Date.now() - cached.storedAtMs < TTL_MS) {
                return cached.value;
            }
            const rows = await db
                .select({
                    hardCapUsdCents: schema.workspaceEventBundleSettings.hardCapUsdCents,
                })
                .from(schema.workspaceEventBundleSettings)
                .where(eq(schema.workspaceEventBundleSettings.workspaceId, workspaceId))
                .limit(1);
            const row = rows[0];
            const settings: EventBundleSettings | null = row
                ? { hardCapUsdCents: row.hardCapUsdCents }
                : null;
            cache.set(workspaceId, settings, Date.now());
            return settings;
        },
        async upsert(input) {
            await db
                .insert(schema.workspaceEventBundleSettings)
                .values({
                    workspaceId: input.workspaceId,
                    hardCapUsdCents: input.hardCapUsdCents,
                })
                .onConflictDoUpdate({
                    target: schema.workspaceEventBundleSettings.workspaceId,
                    set: {
                        hardCapUsdCents: input.hardCapUsdCents,
                        updatedAt: new Date(),
                    },
                });
            cache.delete(input.workspaceId);
        },
    };
}

/** Clear the cache. Test-only. */
export function resetEventBundleSettingsCache(): void {
    cache.clear();
}
