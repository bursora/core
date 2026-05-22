/**
 * CapacityRow — 3 StatTile cards: API-keys heartbeat, member roster, and
 * channel health. Built via `createCapacityRow(deps)` so tests can inject
 * deterministic stubs without a global hatch in the loaders.
 */

import { StatTile, type StatTileTone } from "@/components/ui/workspace/stat-tile";
import { formatCount, formatRelativeTime } from "@/lib/format";
import { listApiKeys, listPendingInvites, listWorkspaceMembers } from "@/lib/identity/server";
import { getLastUsageEventAt } from "@/lib/metering/server";
import { getChannelHealth, type ChannelHealthRow } from "@/lib/notifications";
import { buildWorkspacePath } from "@/lib/routes";
import Link from "next/link";

interface CapacityRowProps {
    readonly workspaceId: string;
    readonly now?: Date;
}

export interface CapacityRowDeps {
    readonly getKeysCount: (workspaceId: string) => Promise<number>;
    readonly getLastEventAt: (workspaceId: string) => Promise<Date | null>;
    readonly getMemberCount: (workspaceId: string) => Promise<number>;
    readonly getPendingCount: (workspaceId: string) => Promise<number>;
    readonly getChannelHealth: (workspaceId: string) => Promise<readonly ChannelHealthRow[]>;
}

export function createCapacityRow(deps: CapacityRowDeps) {
    return async function CapacityRow({ workspaceId, now }: CapacityRowProps) {
        const evalAt = now ?? new Date();

        const [keysCount, lastEventAt, memberCount, pendingCount, channels] = await Promise.all([
            deps.getKeysCount(workspaceId),
            deps.getLastEventAt(workspaceId),
            deps.getMemberCount(workspaceId),
            deps.getPendingCount(workspaceId),
            deps.getChannelHealth(workspaceId),
        ]);

        const keysHint =
            lastEventAt === null
                ? "no events yet"
                : `last used ${formatRelativeTime(lastEventAt, evalAt.getTime())}`;
        const keysTone: StatTileTone = keysCount === 0 ? "warning" : "muted";

        const membersHint = pendingCount > 0 ? `${pendingCount} pending` : "manage →";

        const channelsTone: StatTileTone = channels.some((c) => c.lastStatus === "failed")
            ? "destructive"
            : "muted";
        const channelsHint = channels.length === 0 ? "no channels configured" : "manage →";

        return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Link href={buildWorkspacePath(workspaceId, "keys")} className="block">
                    <StatTile
                        label="API keys"
                        value={formatCount(keysCount)}
                        tone={keysTone}
                        hint={keysHint}
                    />
                </Link>
                <Link href={buildWorkspacePath(workspaceId, "members")} className="block">
                    <StatTile
                        label="Members"
                        value={formatCount(memberCount)}
                        tone="muted"
                        hint={membersHint}
                    />
                </Link>
                <Link href={buildWorkspacePath(workspaceId, "settings")} className="block">
                    <StatTile
                        label="Channels"
                        value={formatCount(channels.length)}
                        tone={channelsTone}
                        hint={channelsHint}
                    />
                </Link>
            </div>
        );
    };
}

export const CapacityRow = createCapacityRow({
    getKeysCount: async (workspaceId) => (await listApiKeys(workspaceId)).length,
    getLastEventAt: (workspaceId) => getLastUsageEventAt({ workspaceId }),
    getMemberCount: async (workspaceId) => (await listWorkspaceMembers(workspaceId)).length,
    getPendingCount: async (workspaceId) => (await listPendingInvites(workspaceId)).length,
    getChannelHealth: (workspaceId) => getChannelHealth(workspaceId),
});
