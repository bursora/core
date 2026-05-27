/**
 * Tests for the saveAlertChannels use case.
 *
 * Behavior under test:
 *   1. Validates Slack/Discord URL shape (email shape is enforced at the
 *      action boundary, not here).
 *   2. Writes the same channel list to both 'anomaly' and 'budget' rule
 *      rows (single config drives both dispatch paths).
 *   3. Rejects malformed URLs and skips the repo write.
 *   4. Workspace isolation.
 */

import type { AlertChannel } from "@/lib/notification/alert-channel";
import type { AlertChannelRepository } from "@/lib/notification/alert-channel.repository";
import { saveAlertChannels } from "@/lib/notification/save-alert-channels.usecase";
import type { AlertKind } from "@/lib/severity";
import { describe, expect, test } from "bun:test";

interface UpsertCall {
    readonly workspaceId: string;
    readonly ruleKinds: readonly AlertKind[];
    readonly channels: readonly AlertChannel[];
}

const makeRepo = (): { repo: AlertChannelRepository; calls: UpsertCall[] } => {
    const calls: UpsertCall[] = [];
    const repo: AlertChannelRepository = {
        listForRuleKind: async () => [],
        upsertChannelsForRuleKinds: async (workspaceId, ruleKinds, channels) => {
            calls.push({ workspaceId, ruleKinds: [...ruleKinds], channels: [...channels] });
        },
    };
    return { repo, calls };
};

describe("saveAlertChannels", () => {
    test("writes to both anomaly and budget rule rows atomically in one call", async () => {
        const { repo, calls } = makeRepo();

        await saveAlertChannels({
            channels: repo,
            workspaceId: "ws-1",
            input: { slack: { url: "https://hooks.slack.com/services/T/B/abc" } },
        });

        expect(calls.length).toBe(1);
        expect(calls[0]?.workspaceId).toBe("ws-1");
        expect([...(calls[0]?.ruleKinds ?? [])].sort()).toEqual(["anomaly", "budget"]);
        expect(calls[0]?.channels).toEqual([
            { kind: "slack", url: "https://hooks.slack.com/services/T/B/abc" },
        ]);
    });

    test("saves discord-only", async () => {
        const { repo, calls } = makeRepo();
        await saveAlertChannels({
            channels: repo,
            workspaceId: "ws-1",
            input: { discord: { url: "https://discord.com/api/webhooks/123/abc" } },
        });
        expect(calls[0]?.channels).toEqual([
            { kind: "discord", url: "https://discord.com/api/webhooks/123/abc" },
        ]);
    });

    test("accepts discordapp.com host as well", async () => {
        const { repo, calls } = makeRepo();
        await saveAlertChannels({
            channels: repo,
            workspaceId: "ws-1",
            input: { discord: { url: "https://discordapp.com/api/webhooks/123/abc" } },
        });
        expect(calls[0]?.channels.length).toBe(1);
    });

    test("saves email channel when provided", async () => {
        const { repo, calls } = makeRepo();
        await saveAlertChannels({
            channels: repo,
            workspaceId: "ws-1",
            input: { email: { address: "ops@example.com" } },
        });
        expect(calls[0]?.channels).toEqual([{ kind: "email", address: "ops@example.com" }]);
    });

    test("saves all three when all provided", async () => {
        const { repo, calls } = makeRepo();
        await saveAlertChannels({
            channels: repo,
            workspaceId: "ws-1",
            input: {
                slack: { url: "https://hooks.slack.com/services/T/B/abc" },
                discord: { url: "https://discord.com/api/webhooks/123/abc" },
                email: { address: "ops@example.com" },
            },
        });
        const kinds = (calls[0]?.channels ?? []).map((c) => c.kind).sort();
        expect(kinds).toEqual(["discord", "email", "slack"]);
    });

    test("clears all channels when input is empty (both rule kinds)", async () => {
        const { repo, calls } = makeRepo();
        await saveAlertChannels({ channels: repo, workspaceId: "ws-1", input: {} });
        expect(calls.length).toBe(1);
        expect([...(calls[0]?.ruleKinds ?? [])].sort()).toEqual(["anomaly", "budget"]);
        expect(calls[0]?.channels).toEqual([]);
    });

    test("rejects invalid Slack URL", async () => {
        const { repo } = makeRepo();
        await expect(
            saveAlertChannels({
                channels: repo,
                workspaceId: "ws-1",
                input: { slack: { url: "https://example.com/webhook" } },
            }),
        ).rejects.toThrow();
    });

    test("rejects invalid Discord URL", async () => {
        const { repo } = makeRepo();
        await expect(
            saveAlertChannels({
                channels: repo,
                workspaceId: "ws-1",
                input: { discord: { url: "https://example.com/webhook" } },
            }),
        ).rejects.toThrow();
    });

    test("rejects non-HTTPS slack URL", async () => {
        const { repo } = makeRepo();
        await expect(
            saveAlertChannels({
                channels: repo,
                workspaceId: "ws-1",
                input: { slack: { url: "http://hooks.slack.com/services/T/B/abc" } },
            }),
        ).rejects.toThrow();
    });

    test("rejects non-HTTPS discord URL", async () => {
        const { repo } = makeRepo();
        await expect(
            saveAlertChannels({
                channels: repo,
                workspaceId: "ws-1",
                input: { discord: { url: "http://discord.com/api/webhooks/123/abc" } },
            }),
        ).rejects.toThrow();
    });

    test("rejects empty slack URL string", async () => {
        const { repo } = makeRepo();
        await expect(
            saveAlertChannels({
                channels: repo,
                workspaceId: "ws-1",
                input: { slack: { url: "" } },
            }),
        ).rejects.toThrow();
    });

    test("workspace isolation: writes to the requested workspace only", async () => {
        const { repo, calls } = makeRepo();
        await saveAlertChannels({
            channels: repo,
            workspaceId: "ws-42",
            input: { slack: { url: "https://hooks.slack.com/services/T/B/abc" } },
        });
        for (const call of calls) expect(call.workspaceId).toBe("ws-42");
    });

    test("does not write when validation fails", async () => {
        const { repo, calls } = makeRepo();
        try {
            await saveAlertChannels({
                channels: repo,
                workspaceId: "ws-1",
                input: { slack: { url: "not-a-url" } },
            });
        } catch {
            // expected
        }
        expect(calls.length).toBe(0);
    });
});
