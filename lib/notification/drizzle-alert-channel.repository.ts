/**
 * Drizzle implementation of the AlertChannelRepository.
 *
 * Reads `alert_rules.channels` (jsonb array) filtered by workspace + rule
 * kind. Channels are stored as discriminated-union JSON:
 *   - `{ kind: 'slack' | 'discord', url: string }`
 *   - `{ kind: 'email', address: string }`
 * Invalid entries are skipped silently — the dispatcher logs
 * misconfigurations elsewhere.
 *
 * Writes target the `(workspace_id, kind)` row. If no row exists the
 * method inserts one; otherwise it overwrites the channels jsonb in place.
 */

import "server-only";

import type { Db } from "@/lib/db";
import { alertRules } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { AlertKind } from "../severity";
import type { AlertChannel } from "./alert-channel";
import type { AlertChannelRepository } from "./alert-channel.repository";

const isAlertChannel = (raw: unknown): raw is AlertChannel => {
    if (typeof raw !== "object" || raw === null) return false;
    const candidate = raw as Record<string, unknown>;
    if (candidate.kind === "slack" || candidate.kind === "discord") {
        return typeof candidate.url === "string" && candidate.url.length > 0;
    }
    if (candidate.kind === "email") {
        return typeof candidate.address === "string" && candidate.address.length > 0;
    }
    return false;
};

const toJsonPayload = (channels: readonly AlertChannel[]): unknown[] =>
    channels.map((c) =>
        c.kind === "email" ? { kind: "email", address: c.address } : { kind: c.kind, url: c.url },
    );

export const drizzleAlertChannelRepository = (db: Db): AlertChannelRepository => ({
    listForRuleKind: async (
        workspaceId: string,
        ruleKind: AlertKind,
    ): Promise<readonly AlertChannel[]> => {
        const rows = await db
            .select({ channels: alertRules.channels })
            .from(alertRules)
            .where(and(eq(alertRules.workspaceId, workspaceId), eq(alertRules.kind, ruleKind)));

        const out: AlertChannel[] = [];
        for (const row of rows) {
            if (!Array.isArray(row.channels)) continue;
            for (const entry of row.channels) {
                if (isAlertChannel(entry)) out.push(entry);
            }
        }
        return out;
    },

    upsertChannelsForRuleKinds: async (
        workspaceId: string,
        ruleKinds: readonly AlertKind[],
        channels: readonly AlertChannel[],
    ): Promise<void> => {
        if (ruleKinds.length === 0) return;
        const payload = toJsonPayload(channels);

        await db.transaction(async (tx) => {
            for (const ruleKind of ruleKinds) {
                const existing = await tx
                    .select({ id: alertRules.id })
                    .from(alertRules)
                    .where(
                        and(eq(alertRules.workspaceId, workspaceId), eq(alertRules.kind, ruleKind)),
                    )
                    .limit(1);

                if (existing[0]) {
                    await tx
                        .update(alertRules)
                        .set({ channels: payload })
                        .where(eq(alertRules.id, existing[0].id));
                    continue;
                }

                await tx.insert(alertRules).values({
                    workspaceId,
                    kind: ruleKind,
                    params: {},
                    channels: payload,
                });
            }
        });
    },
});
