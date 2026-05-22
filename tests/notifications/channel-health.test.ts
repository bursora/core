/**
 * Tests for the channel-health read path used by the dashboard status strip.
 *
 * Configured channels come from `alert_rules.channels` arrays. Deduped by
 * kind so two rules with the same Slack webhook produce one row. For each
 * configured kind, the latest `notification_deliveries` row drives
 * lastAttemptAt/lastStatus/lastError; failures in the last 24h are counted.
 */

import type { AlertChannel } from "@/lib/notification/alert-channel";
import type { NotificationChannelKind } from "@/lib/notifications/channel-health";
import { channelHealthFromSources } from "@/lib/notifications/channel-health-query";
import type {
    NotificationDeliveriesReader,
    NotificationDeliveryRecord,
} from "@/lib/notifications/notification-deliveries.repository";
import { describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const NOW = new Date("2026-05-16T12:00:00.000Z");

const ago = (ms: number): Date => new Date(NOW.getTime() - ms);

class InMemoryDeliveries implements NotificationDeliveriesReader {
    constructor(private readonly rows: readonly NotificationDeliveryRecord[]) {}

    async latestPerKind(
        workspaceId: string,
        kinds: readonly NotificationChannelKind[],
    ): Promise<ReadonlyMap<NotificationChannelKind, NotificationDeliveryRecord>> {
        const out = new Map<NotificationChannelKind, NotificationDeliveryRecord>();
        for (const kind of kinds) {
            const candidates = this.rows
                .filter((r) => r.workspaceId === workspaceId && r.kind === kind)
                .sort((a, b) => b.attemptedAt.getTime() - a.attemptedAt.getTime());
            if (candidates[0]) out.set(kind, candidates[0]);
        }
        return out;
    }

    async countFailuresSince(
        workspaceId: string,
        kinds: readonly NotificationChannelKind[],
        since: Date,
    ): Promise<ReadonlyMap<NotificationChannelKind, number>> {
        const out = new Map<NotificationChannelKind, number>();
        for (const kind of kinds) {
            const n = this.rows.filter(
                (r) =>
                    r.workspaceId === workspaceId &&
                    r.kind === kind &&
                    r.status === "failed" &&
                    r.attemptedAt.getTime() >= since.getTime(),
            ).length;
            out.set(kind, n);
        }
        return out;
    }
}

const slack: AlertChannel = { kind: "slack", url: "https://hooks.slack.com/abc" };
const slack2: AlertChannel = { kind: "slack", url: "https://hooks.slack.com/abc" };
const discord: AlertChannel = { kind: "discord", url: "https://discord.com/api/webhooks/xyz" };
const email: AlertChannel = { kind: "email", address: "ops@example.com" };

describe("channelHealthFromSources", () => {
    test("returns an empty array when no alert rules are configured", async () => {
        const rows = await channelHealthFromSources({
            workspaceId: WORKSPACE,
            configuredChannels: [],
            deliveries: new InMemoryDeliveries([]),
            now: NOW,
        });
        expect(rows).toEqual([]);
    });

    test("a Slack rule with no deliveries yields lastAttemptAt: null", async () => {
        const rows = await channelHealthFromSources({
            workspaceId: WORKSPACE,
            configuredChannels: [slack],
            deliveries: new InMemoryDeliveries([]),
            now: NOW,
        });
        expect(rows).toEqual([
            {
                kind: "slack",
                lastAttemptAt: null,
                lastStatus: null,
                lastError: null,
                recentFailureCount: 0,
            },
        ]);
    });

    test("an ok delivery surfaces as lastStatus 'ok'", async () => {
        const at = ago(5 * 60 * 1000);
        const rows = await channelHealthFromSources({
            workspaceId: WORKSPACE,
            configuredChannels: [slack],
            deliveries: new InMemoryDeliveries([
                {
                    workspaceId: WORKSPACE,
                    kind: "slack",
                    status: "ok",
                    error: null,
                    attemptedAt: at,
                },
            ]),
            now: NOW,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.lastStatus).toBe("ok");
        expect(rows[0]?.lastAttemptAt?.getTime()).toBe(at.getTime());
        expect(rows[0]?.lastError).toBeNull();
        expect(rows[0]?.recentFailureCount).toBe(0);
    });

    test("a failed delivery surfaces error and counts toward failures", async () => {
        const rows = await channelHealthFromSources({
            workspaceId: WORKSPACE,
            configuredChannels: [slack],
            deliveries: new InMemoryDeliveries([
                {
                    workspaceId: WORKSPACE,
                    kind: "slack",
                    status: "failed",
                    error: "401 Unauthorized",
                    attemptedAt: ago(5 * 60 * 1000),
                },
            ]),
            now: NOW,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.lastStatus).toBe("failed");
        expect(rows[0]?.lastError).toBe("401 Unauthorized");
        expect(rows[0]?.recentFailureCount).toBe(1);
    });

    test("two Slack rules with overlapping webhooks dedupe to one Slack row", async () => {
        const rows = await channelHealthFromSources({
            workspaceId: WORKSPACE,
            configuredChannels: [slack, slack2],
            deliveries: new InMemoryDeliveries([]),
            now: NOW,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.kind).toBe("slack");
    });

    test("mixed Slack + Discord rules produce two rows", async () => {
        const rows = await channelHealthFromSources({
            workspaceId: WORKSPACE,
            configuredChannels: [slack, discord],
            deliveries: new InMemoryDeliveries([]),
            now: NOW,
        });
        const kinds = rows.map((r) => r.kind).sort();
        expect(kinds).toEqual(["discord", "slack"]);
    });

    test("email channels surface alongside Slack / Discord in stable order", async () => {
        const rows = await channelHealthFromSources({
            workspaceId: WORKSPACE,
            configuredChannels: [email, discord, slack],
            deliveries: new InMemoryDeliveries([]),
            now: NOW,
        });
        const kinds = rows.map((r) => r.kind);
        expect(kinds).toEqual(["slack", "discord", "email"]);
    });

    test("an email delivery surfaces lastStatus and recentFailureCount like webhooks", async () => {
        const rows = await channelHealthFromSources({
            workspaceId: WORKSPACE,
            configuredChannels: [email],
            deliveries: new InMemoryDeliveries([
                {
                    workspaceId: WORKSPACE,
                    kind: "email",
                    status: "failed",
                    error: "smtp 550 rejected",
                    attemptedAt: ago(2 * 60 * 60 * 1000),
                },
            ]),
            now: NOW,
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.kind).toBe("email");
        expect(rows[0]?.lastStatus).toBe("failed");
        expect(rows[0]?.lastError).toBe("smtp 550 rejected");
        expect(rows[0]?.recentFailureCount).toBe(1);
    });

    test("recentFailureCount only counts failures in the last 24 hours", async () => {
        const rows = await channelHealthFromSources({
            workspaceId: WORKSPACE,
            configuredChannels: [slack],
            deliveries: new InMemoryDeliveries([
                {
                    workspaceId: WORKSPACE,
                    kind: "slack",
                    status: "failed",
                    error: "boom",
                    attemptedAt: ago(2 * 60 * 60 * 1000),
                },
                {
                    workspaceId: WORKSPACE,
                    kind: "slack",
                    status: "failed",
                    error: "boom",
                    attemptedAt: ago(10 * 60 * 60 * 1000),
                },
                {
                    workspaceId: WORKSPACE,
                    kind: "slack",
                    status: "failed",
                    error: "ancient",
                    attemptedAt: ago(48 * 60 * 60 * 1000),
                },
            ]),
            now: NOW,
        });
        expect(rows[0]?.recentFailureCount).toBe(2);
    });
});
