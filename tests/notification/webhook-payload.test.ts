/**
 * Tests for the webhook + email payload renderer.
 *
 *   - Slack: { text }
 *   - Discord: { content }
 *   - Email: { subject, text }
 *
 * Two event kinds: anomaly (z-score crossing) + budget (spend exceeded).
 */

import type { AlertRaisedEvent, BudgetAlertRaisedEvent } from "@/lib/event-bus";
import { renderEmailPayload, renderWebhookPayload } from "@/lib/notification/webhook-payload";
import { describe, expect, test } from "bun:test";

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

describe("renderWebhookPayload anomaly", () => {
    test("Slack format wraps in { text } and includes tenant + agent + reason", () => {
        const payload = renderWebhookPayload("slack", anomalyEvent);
        expect(payload).toHaveProperty("text");
        const text = (payload as { text: string }).text;
        expect(text).toContain("tenant-a");
        expect(text).toContain("support-bot");
        expect(text).toContain("Spend spiked");
    });

    test("Discord format wraps in { content } with same body", () => {
        const payload = renderWebhookPayload("discord", anomalyEvent);
        expect(payload).toHaveProperty("content");
        const content = (payload as { content: string }).content;
        expect(content).toContain("tenant-a");
        expect(content).toContain("support-bot");
        expect(content).toContain("Spend spiked");
    });

    test("Slack and Discord carry equivalent message text", () => {
        const slack = renderWebhookPayload("slack", anomalyEvent) as { text: string };
        const discord = renderWebhookPayload("discord", anomalyEvent) as { content: string };
        expect(slack.text).toBe(discord.content);
    });

    test("missing tenant/agent renders 'workspace' scope marker", () => {
        const event: AlertRaisedEvent = {
            ...anomalyEvent,
            tenantId: null,
            agentId: null,
        };
        const payload = renderWebhookPayload("slack", event) as { text: string };
        expect(payload.text).toContain("workspace");
    });

    test("body includes window range + aggregate $ on its own line", () => {
        const slack = renderWebhookPayload("slack", anomalyEvent) as { text: string };
        const discord = renderWebhookPayload("discord", anomalyEvent) as { content: string };

        // Both surfaces render the same body and the window line must be present.
        for (const text of [slack.text, discord.content]) {
            expect(text).toContain("$1.23");
            expect(text).toContain("12:00");
            expect(text).toContain("12:05");
        }
        // The window/cost line is rendered separately from the reason.
        expect(slack.text.split("\n").length).toBeGreaterThanOrEqual(3);
    });

    test("severity surface in payload (warning vs critical)", () => {
        const warning = renderWebhookPayload("slack", {
            ...anomalyEvent,
            severity: "warning",
        }) as { text: string };
        const critical = renderWebhookPayload("slack", {
            ...anomalyEvent,
            severity: "critical",
        }) as { text: string };
        expect(warning.text.toLowerCase()).toContain("warning");
        expect(critical.text.toLowerCase()).toContain("critical");
    });
});

describe("renderWebhookPayload budget", () => {
    test("Slack body names budget exceeded, scope, spend, limit, pctOver, period", () => {
        const payload = renderWebhookPayload("slack", budgetEvent) as { text: string };
        const text = payload.text;
        expect(text.toLowerCase()).toContain("budget exceeded");
        expect(text).toContain("tenant:acme");
        expect(text).toContain("$75.00");
        expect(text).toContain("$50.00");
        expect(text).toContain("50% over");
        expect(text).toContain("2025-05-01T00:00:00.000Z");
    });

    test("severity tag matches event.severity (block → critical)", () => {
        const payload = renderWebhookPayload("slack", budgetEvent) as { text: string };
        expect(payload.text).toContain("[CRITICAL]");
    });

    test("warning severity (throttle/notify modes) renders [WARNING]", () => {
        const payload = renderWebhookPayload("slack", {
            ...budgetEvent,
            mode: "notify",
            severity: "warning",
        }) as { text: string };
        expect(payload.text).toContain("[WARNING]");
    });

    test("null scopeId renders '*'", () => {
        const payload = renderWebhookPayload("slack", {
            ...budgetEvent,
            scopeType: "workspace",
            scopeId: null,
        }) as { text: string };
        expect(payload.text).toContain("workspace:*");
    });

    test("Discord variant carries identical text via { content }", () => {
        const slack = renderWebhookPayload("slack", budgetEvent) as { text: string };
        const discord = renderWebhookPayload("discord", budgetEvent) as { content: string };
        expect(discord.content).toBe(slack.text);
    });
});

describe("renderWebhookPayload deniedSinceTrip enrichment", () => {
    test("budget Slack body appends 'N calls denied since trip' when deniedSinceTrip > 0", () => {
        const payload = renderWebhookPayload("slack", budgetEvent, {
            deniedSinceTrip: 12,
        }) as { text: string };
        expect(payload.text).toContain("12 calls denied since trip");
    });

    test("budget Discord variant carries the same enrichment", () => {
        const payload = renderWebhookPayload("discord", budgetEvent, {
            deniedSinceTrip: 12,
        }) as { content: string };
        expect(payload.content).toContain("12 calls denied since trip");
    });

    test("anomaly events ignore deniedSinceTrip (only budgets carry it)", () => {
        const payload = renderWebhookPayload("slack", anomalyEvent, {
            deniedSinceTrip: 12,
        }) as { text: string };
        expect(payload.text).not.toContain("denied since trip");
    });

    test("omits the enrichment when deniedSinceTrip is 0 or undefined", () => {
        const omitted = renderWebhookPayload("slack", budgetEvent) as { text: string };
        const zero = renderWebhookPayload("slack", budgetEvent, {
            deniedSinceTrip: 0,
        }) as { text: string };
        expect(omitted.text).not.toContain("denied");
        expect(zero.text).not.toContain("denied");
    });
});

describe("renderEmailPayload", () => {
    test("anomaly email subject names anomaly + workspace", () => {
        const email = renderEmailPayload(anomalyEvent);
        expect(email.subject.toLowerCase()).toContain("anomaly");
        expect(email.subject).toContain("ws-1");
    });

    test("anomaly email body includes the window range + aggregate $", () => {
        const email = renderEmailPayload(anomalyEvent);
        expect(email.text).toContain("$1.23");
        expect(email.text).toContain("12:00");
        expect(email.text).toContain("12:05");
    });

    test("budget email subject names budget exceeded + scope", () => {
        const email = renderEmailPayload(budgetEvent);
        expect(email.subject.toLowerCase()).toContain("budget exceeded");
        expect(email.subject).toContain("tenant:acme");
    });

    test("email text body matches Slack body", () => {
        const slack = renderWebhookPayload("slack", budgetEvent) as { text: string };
        const email = renderEmailPayload(budgetEvent);
        expect(email.text).toBe(slack.text);
    });

    test("budget email text appends denied-since-trip enrichment when provided", () => {
        const email = renderEmailPayload(budgetEvent, { deniedSinceTrip: 7 });
        expect(email.text).toContain("7 calls denied since trip");
    });
});
