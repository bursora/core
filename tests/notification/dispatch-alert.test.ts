/**
 * Tests for the dispatch-alert handler.
 *
 * Subscribes to `alert.raised`. Reads channels filtered by event kind,
 * routes slack/discord to WebhookSender and email to Mailer. One channel
 * failure must not abort the others.
 */

import type { AlertRaisedEvent, BudgetAlertRaisedEvent } from "@/lib/event-bus";
import type { AlertChannel } from "@/lib/notification/alert-channel";
import type { AlertChannelRepository } from "@/lib/notification/alert-channel.repository";
import { dispatchAlertHandler } from "@/lib/notification/dispatch-alert.handler";
import type { Mailer, MailMessage } from "@/lib/notification/send";
import type { WebhookSender } from "@/lib/notification/webhook-sender";
import type {
    InsertNotificationDeliveryInput,
    NotificationDeliveriesWriter,
} from "@/lib/notifications/notification-deliveries.repository";
import type { AlertKind } from "@/lib/severity";
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

const anomalyEvent: AlertRaisedEvent = {
    kind: "anomaly",
    alertId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    workspaceId: "ws-1",
    tenantId: "tenant-a",
    agentId: "support-bot",
    reason: "Spend spiked 5.0x baseline.",
    deviation: 200,
    severity: "critical",
    raisedAt: new Date("2025-05-10T12:00:00Z"),
    windowStart: new Date("2025-05-10T12:00:00Z"),
    windowEnd: new Date("2025-05-10T12:05:00Z"),
    windowCostUsd: 1.23,
};

const budgetEvent: BudgetAlertRaisedEvent = {
    kind: "budget",
    alertId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    workspaceId: "ws-1",
    budgetId: "b-99",
    scopeType: "tenant",
    scopeId: "acme",
    period: "monthly",
    periodFrom: new Date("2025-05-01T00:00:00Z"),
    mode: "block",
    used: 75,
    limit: 50,
    pctOver: 50,
    severity: "critical",
    raisedAt: new Date("2025-05-10T12:00:00Z"),
};

interface ChannelKey {
    readonly workspaceId: string;
    readonly ruleKind: AlertKind;
}

const channelKey = (k: ChannelKey): string => `${k.workspaceId}:${k.ruleKind}`;

class FakeChannelRepo implements AlertChannelRepository {
    private readonly store = new Map<string, readonly AlertChannel[]>();

    constructor(entries: ReadonlyArray<{ key: ChannelKey; channels: readonly AlertChannel[] }>) {
        for (const e of entries) this.store.set(channelKey(e.key), e.channels);
    }

    async listForRuleKind(
        workspaceId: string,
        ruleKind: AlertKind,
    ): Promise<readonly AlertChannel[]> {
        return this.store.get(channelKey({ workspaceId, ruleKind })) ?? [];
    }

    async upsertChannelsForRuleKinds(
        workspaceId: string,
        ruleKinds: readonly AlertKind[],
        channels: readonly AlertChannel[],
    ): Promise<void> {
        for (const ruleKind of ruleKinds) {
            this.store.set(channelKey({ workspaceId, ruleKind }), [...channels]);
        }
    }
}

interface SentRecord {
    readonly url: string;
    readonly body: unknown;
}

class CapturingSender implements WebhookSender {
    readonly sent: SentRecord[] = [];
    async post(url: string, body: unknown): Promise<void> {
        this.sent.push({ url, body });
    }
}

class FailingSender implements WebhookSender {
    readonly sent: SentRecord[] = [];
    constructor(private readonly failingUrl: string) {}
    async post(url: string, body: unknown): Promise<void> {
        if (url === this.failingUrl) throw new Error("network down");
        this.sent.push({ url, body });
    }
}

class CapturingMailer implements Mailer {
    readonly messages: MailMessage[] = [];
    async send(message: MailMessage): Promise<void> {
        this.messages.push(message);
    }
}

class CapturingDeliveriesWriter implements NotificationDeliveriesWriter {
    readonly inserts: InsertNotificationDeliveryInput[] = [];
    async insert(input: InsertNotificationDeliveryInput): Promise<void> {
        this.inserts.push(input);
    }
}

const sha256Hex = (s: string): string => createHash("sha256").update(s).digest("hex");

describe("dispatchAlertHandler", () => {
    test("anomaly event reads anomaly channels and posts Slack + Discord", async () => {
        const channels: AlertChannel[] = [
            { kind: "slack", url: "https://hooks.slack.com/abc" },
            { kind: "discord", url: "https://discord.com/api/webhooks/xyz" },
        ];
        const repo = new FakeChannelRepo([
            { key: { workspaceId: "ws-1", ruleKind: "anomaly" }, channels },
        ]);
        const sender = new CapturingSender();
        const mailer = new CapturingMailer();

        await dispatchAlertHandler({ channels: repo, sender, mailer })(anomalyEvent);

        expect(sender.sent.length).toBe(2);
        expect(mailer.messages.length).toBe(0);
    });

    test("budget event reads budget channels (anomaly channels are not used)", async () => {
        const repo = new FakeChannelRepo([
            {
                key: { workspaceId: "ws-1", ruleKind: "anomaly" },
                channels: [{ kind: "slack", url: "https://hooks.slack.com/anomaly" }],
            },
            {
                key: { workspaceId: "ws-1", ruleKind: "budget" },
                channels: [{ kind: "slack", url: "https://hooks.slack.com/budget" }],
            },
        ]);
        const sender = new CapturingSender();
        const mailer = new CapturingMailer();

        await dispatchAlertHandler({ channels: repo, sender, mailer })(budgetEvent);

        expect(sender.sent.length).toBe(1);
        expect(sender.sent[0]?.url).toContain("/budget");
    });

    test("email channel routes to mailer, not webhook sender", async () => {
        const channels: AlertChannel[] = [
            { kind: "email", address: "ops@example.com" },
            { kind: "slack", url: "https://hooks.slack.com/abc" },
        ];
        const repo = new FakeChannelRepo([
            { key: { workspaceId: "ws-1", ruleKind: "budget" }, channels },
        ]);
        const sender = new CapturingSender();
        const mailer = new CapturingMailer();

        await dispatchAlertHandler({ channels: repo, sender, mailer })(budgetEvent);

        expect(mailer.messages.length).toBe(1);
        expect(mailer.messages[0]?.to).toBe("ops@example.com");
        expect(mailer.messages[0]?.subject.toLowerCase()).toContain("budget exceeded");
        expect(sender.sent.length).toBe(1);
    });

    test("Slack failure does not block Discord delivery", async () => {
        const channels: AlertChannel[] = [
            { kind: "slack", url: "https://hooks.slack.com/abc" },
            { kind: "discord", url: "https://discord.com/api/webhooks/xyz" },
        ];
        const repo = new FakeChannelRepo([
            { key: { workspaceId: "ws-1", ruleKind: "anomaly" }, channels },
        ]);
        const sender = new FailingSender("https://hooks.slack.com/abc");
        const mailer = new CapturingMailer();

        await dispatchAlertHandler({ channels: repo, sender, mailer })(anomalyEvent);

        expect(sender.sent.length).toBe(1);
        expect(sender.sent[0]?.url).toContain("discord.com");
    });

    test("workspace with no channels configured for kind → no posts, no throw", async () => {
        const repo = new FakeChannelRepo([]);
        const sender = new CapturingSender();
        const mailer = new CapturingMailer();
        await dispatchAlertHandler({ channels: repo, sender, mailer })(anomalyEvent);
        expect(sender.sent.length).toBe(0);
        expect(mailer.messages.length).toBe(0);
    });

    test("anomaly payload contents reflect the event (tenant + agent + reason)", async () => {
        const channels: AlertChannel[] = [{ kind: "slack", url: "https://hooks.slack.com/abc" }];
        const repo = new FakeChannelRepo([
            { key: { workspaceId: "ws-1", ruleKind: "anomaly" }, channels },
        ]);
        const sender = new CapturingSender();
        const mailer = new CapturingMailer();

        await dispatchAlertHandler({ channels: repo, sender, mailer })(anomalyEvent);

        const body = sender.sent[0]?.body as { text: string };
        expect(body.text).toContain("tenant-a");
        expect(body.text).toContain("support-bot");
        expect(body.text).toContain("Spend spiked");
    });

    test("records a notification_deliveries row with status=ok per successful Slack/Discord/email send", async () => {
        const channels: AlertChannel[] = [
            { kind: "slack", url: "https://hooks.slack.com/abc" },
            { kind: "discord", url: "https://discord.com/api/webhooks/xyz" },
            { kind: "email", address: "ops@example.com" },
        ];
        const repo = new FakeChannelRepo([
            { key: { workspaceId: "ws-1", ruleKind: "anomaly" }, channels },
        ]);
        const sender = new CapturingSender();
        const mailer = new CapturingMailer();
        const deliveries = new CapturingDeliveriesWriter();

        await dispatchAlertHandler({
            channels: repo,
            sender,
            mailer,
            deliveries,
        })(anomalyEvent);

        expect(deliveries.inserts).toHaveLength(3);
        const byKind = Object.fromEntries(deliveries.inserts.map((d) => [d.kind, d]));
        expect(byKind.slack?.status).toBe("ok");
        expect(byKind.slack?.targetHash).toBe(sha256Hex("https://hooks.slack.com/abc"));
        expect(byKind.discord?.status).toBe("ok");
        expect(byKind.discord?.targetHash).toBe(sha256Hex("https://discord.com/api/webhooks/xyz"));
        expect(byKind.email?.status).toBe("ok");
        expect(byKind.email?.targetHash).toBe(sha256Hex("ops@example.com"));
        expect(byKind.email?.targetHash).not.toContain("example.com");
    });

    test("records a failed row when the mailer throws", async () => {
        const channels: AlertChannel[] = [{ kind: "email", address: "ops@example.com" }];
        const repo = new FakeChannelRepo([
            { key: { workspaceId: "ws-1", ruleKind: "anomaly" }, channels },
        ]);
        const sender = new CapturingSender();
        const mailer: Mailer = {
            async send(): Promise<void> {
                throw new Error("smtp 550 rejected");
            },
        };
        const deliveries = new CapturingDeliveriesWriter();

        await dispatchAlertHandler({
            channels: repo,
            sender,
            mailer,
            deliveries,
        })(anomalyEvent);

        expect(deliveries.inserts).toHaveLength(1);
        const row = deliveries.inserts[0];
        expect(row?.kind).toBe("email");
        expect(row?.status).toBe("failed");
        expect(row?.error).toContain("smtp 550 rejected");
        expect(row?.targetHash).toBe(sha256Hex("ops@example.com"));
    });

    test("records a failed row when the webhook sender throws", async () => {
        const channels: AlertChannel[] = [
            { kind: "slack", url: "https://hooks.slack.com/abc" },
            { kind: "discord", url: "https://discord.com/api/webhooks/xyz" },
        ];
        const repo = new FakeChannelRepo([
            { key: { workspaceId: "ws-1", ruleKind: "anomaly" }, channels },
        ]);
        const sender = new FailingSender("https://hooks.slack.com/abc");
        const mailer = new CapturingMailer();
        const deliveries = new CapturingDeliveriesWriter();

        await dispatchAlertHandler({
            channels: repo,
            sender,
            mailer,
            deliveries,
        })(anomalyEvent);

        expect(deliveries.inserts).toHaveLength(2);
        const slack = deliveries.inserts.find((d) => d.kind === "slack");
        const discord = deliveries.inserts.find((d) => d.kind === "discord");
        expect(slack?.status).toBe("failed");
        expect(slack?.error).toContain("network down");
        expect(slack?.targetHash).toBe(sha256Hex("https://hooks.slack.com/abc"));
        expect(discord?.status).toBe("ok");
    });

    test("budget event body includes 'N calls denied since trip' when reader returns a count", async () => {
        const channels: AlertChannel[] = [
            { kind: "slack", url: "https://hooks.slack.com/abc" },
            { kind: "email", address: "ops@example.com" },
        ];
        const repo = new FakeChannelRepo([
            { key: { workspaceId: "ws-1", ruleKind: "budget" }, channels },
        ]);
        const sender = new CapturingSender();
        const mailer = new CapturingMailer();

        await dispatchAlertHandler({
            channels: repo,
            sender,
            mailer,
        })(budgetEvent, { deniedSinceTrip: 21 });

        const slackBody = sender.sent[0]?.body as { text: string };
        expect(slackBody.text).toContain("21 calls denied since trip");
        expect(mailer.messages[0]?.text).toContain("Denied since trip");
        expect(mailer.messages[0]?.text).toContain("21 calls");
    });

    test("anomaly event ignores deniedSinceTrip render option (only budgets carry it)", async () => {
        const channels: AlertChannel[] = [{ kind: "slack", url: "https://hooks.slack.com/abc" }];
        const repo = new FakeChannelRepo([
            { key: { workspaceId: "ws-1", ruleKind: "anomaly" }, channels },
        ]);
        const sender = new CapturingSender();
        const mailer = new CapturingMailer();

        await dispatchAlertHandler({
            channels: repo,
            sender,
            mailer,
        })(anomalyEvent, { deniedSinceTrip: 21 });

        const slackBody = sender.sent[0]?.body as { text: string };
        expect(slackBody.text).not.toContain("denied");
    });

    test("stores target as a 64-char SHA-256 hash, never the raw URL", async () => {
        const url = "https://hooks.slack.com/services/T/B/secret-token";
        const channels: AlertChannel[] = [{ kind: "slack", url }];
        const repo = new FakeChannelRepo([
            { key: { workspaceId: "ws-1", ruleKind: "anomaly" }, channels },
        ]);
        const sender = new CapturingSender();
        const mailer = new CapturingMailer();
        const deliveries = new CapturingDeliveriesWriter();

        await dispatchAlertHandler({
            channels: repo,
            sender,
            mailer,
            deliveries,
        })(anomalyEvent);

        const row = deliveries.inserts[0];
        expect(row?.targetHash).toMatch(/^[0-9a-f]{64}$/);
        expect(row?.targetHash).not.toContain("hooks.slack.com");
        expect(row?.targetHash).not.toContain("secret-token");
    });
});
