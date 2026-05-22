/**
 * Drizzle-backed `SpikeSettingsRepository`. Wraps the
 * `workspace_spike_protection_settings` table. Absent rows surface as
 * `null` so callers can apply the default policy.
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
import type { SpikeSettings, SpikeSettingsRepository } from "./types";

const TTL_MS = 60_000;
const MAX_ENTRIES = 10_000;

const cache = new LruCache<string, SpikeSettings | null>(MAX_ENTRIES);

export function drizzleSpikeSettingsRepository(db: Db): SpikeSettingsRepository {
    return {
        async findByWorkspaceId(workspaceId) {
            const cached = cache.get(workspaceId);
            if (cached && Date.now() - cached.storedAtMs < TTL_MS) {
                return cached.value;
            }
            const rows = await db
                .select({
                    enabled: schema.workspaceSpikeProtectionSettings.enabled,
                    multiplier: schema.workspaceSpikeProtectionSettings.thresholdMultiplier,
                })
                .from(schema.workspaceSpikeProtectionSettings)
                .where(eq(schema.workspaceSpikeProtectionSettings.workspaceId, workspaceId))
                .limit(1);
            const row = rows[0];
            let settings: SpikeSettings | null = null;
            if (row) {
                const multiplier = Number.parseFloat(row.multiplier);
                settings = {
                    enabled: row.enabled,
                    thresholdMultiplier: Number.isFinite(multiplier) ? multiplier : 5,
                };
            }
            cache.set(workspaceId, settings, Date.now());
            return settings;
        },
        async upsert(input) {
            await db
                .insert(schema.workspaceSpikeProtectionSettings)
                .values({
                    workspaceId: input.workspaceId,
                    enabled: input.enabled,
                    thresholdMultiplier: input.thresholdMultiplier.toString(),
                })
                .onConflictDoUpdate({
                    target: schema.workspaceSpikeProtectionSettings.workspaceId,
                    set: {
                        enabled: input.enabled,
                        thresholdMultiplier: input.thresholdMultiplier.toString(),
                        updatedAt: new Date(),
                    },
                });
            cache.delete(input.workspaceId);
        },
    };
}

/** Clear the cache. Test-only. */
export function resetSpikeSettingsCache(): void {
    cache.clear();
}
