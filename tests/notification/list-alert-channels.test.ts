/**
 * Tests for the listAlertChannels use case.
 *
 * Shape under test: returns `{ slack?: { url }, discord?: { url },
 * email?: { address } }` — the settings UI's friendly view of the
 * canonical 'anomaly' alert_rules.channels jsonb.
 */

import type { AlertChannel } from "@/lib/notification/alert-channel";
import type { AlertChannelRepository } from "@/lib/notification/alert-channel.repository";
import { listAlertChannels } from "@/lib/notification/list-alert-channels.usecase";
import type { AlertKind } from "@/lib/severity";
import { describe, expect, test } from "bun:test";

const key = (workspaceId: string, ruleKind: AlertKind): string => `${workspaceId}:${ruleKind}`;

class FakeChannelRepo implements AlertChannelRepository {
    constructor(private readonly map: Map<string, readonly AlertChannel[]>) {}
    async listForRuleKind(
        workspaceId: string,
        ruleKind: AlertKind,
    ): Promise<readonly AlertChannel[]> {
        return this.map.get(key(workspaceId, ruleKind)) ?? [];
    }
    async upsertChannelsForRuleKinds(
        workspaceId: string,
        ruleKinds: readonly AlertKind[],
        channels: readonly AlertChannel[],
    ): Promise<void> {
        for (const ruleKind of ruleKinds) {
            this.map.set(key(workspaceId, ruleKind), [...channels]);
        }
    }
}

describe("listAlertChannels", () => {
    test("returns empty object when no channels configured", async () => {
        const repo = new FakeChannelRepo(new Map());
        const result = await listAlertChannels({ channels: repo, workspaceId: "ws-1" });
        expect(result).toEqual({});
    });

    test("returns slack-only shape", async () => {
        const repo = new FakeChannelRepo(
            new Map([
                [key("ws-1", "anomaly"), [{ kind: "slack", url: "https://hooks.slack.com/abc" }]],
            ]),
        );
        const result = await listAlertChannels({ channels: repo, workspaceId: "ws-1" });
        expect(result).toEqual({ slack: { url: "https://hooks.slack.com/abc" } });
    });

    test("returns discord-only shape", async () => {
        const repo = new FakeChannelRepo(
            new Map([
                [
                    key("ws-1", "anomaly"),
                    [{ kind: "discord", url: "https://discord.com/api/webhooks/xyz" }],
                ],
            ]),
        );
        const result = await listAlertChannels({ channels: repo, workspaceId: "ws-1" });
        expect(result).toEqual({ discord: { url: "https://discord.com/api/webhooks/xyz" } });
    });

    test("returns email-only shape", async () => {
        const repo = new FakeChannelRepo(
            new Map([[key("ws-1", "anomaly"), [{ kind: "email", address: "ops@example.com" }]]]),
        );
        const result = await listAlertChannels({ channels: repo, workspaceId: "ws-1" });
        expect(result).toEqual({ email: { address: "ops@example.com" } });
    });

    test("returns all three keys when all configured", async () => {
        const repo = new FakeChannelRepo(
            new Map([
                [
                    key("ws-1", "anomaly"),
                    [
                        { kind: "slack", url: "https://hooks.slack.com/abc" },
                        { kind: "discord", url: "https://discord.com/api/webhooks/xyz" },
                        { kind: "email", address: "ops@example.com" },
                    ],
                ],
            ]),
        );
        const result = await listAlertChannels({ channels: repo, workspaceId: "ws-1" });
        expect(result.slack?.url).toBe("https://hooks.slack.com/abc");
        expect(result.discord?.url).toBe("https://discord.com/api/webhooks/xyz");
        expect(result.email?.address).toBe("ops@example.com");
    });

    test("workspace isolation: another workspace's channels are not returned", async () => {
        const repo = new FakeChannelRepo(
            new Map([
                [key("ws-1", "anomaly"), [{ kind: "slack", url: "https://hooks.slack.com/abc" }]],
                [
                    key("ws-2", "anomaly"),
                    [{ kind: "discord", url: "https://discord.com/api/webhooks/xyz" }],
                ],
            ]),
        );
        const result = await listAlertChannels({ channels: repo, workspaceId: "ws-1" });
        expect(result.slack).toBeDefined();
        expect(result.discord).toBeUndefined();
    });
});
