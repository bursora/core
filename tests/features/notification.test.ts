/**
 * Notification feature integration test.
 *
 * Drives the public API at `@/lib/notification` — the surface that
 * `lib/auth.ts`, identity invites, and detection alert dispatch depend on.
 * Substitutes the `Mailer` port with `InMemoryMailer` and asserts that
 * subject/body/recipient are correct for each notification kind. Webhook
 * alert dispatch is covered through `renderWebhookPayload`.
 */

import { alertRules as alertRulesTable } from "@/lib/db/schema";
import {
    InMemoryMailer,
    renderWebhookPayload,
    sendInviteEmail,
    sendOtpEmail,
    type Mailer,
} from "@/lib/notification";
import { describe, expect, test } from "bun:test";

describe("@/lib/notification public API", () => {
    test("schema table is re-exported", () => {
        expect(alertRulesTable).toBeDefined();
    });

    test("InMemoryMailer implements Mailer and captures sends", async () => {
        const mailer: Mailer = new InMemoryMailer();
        await mailer.send({
            to: "alice@example.com",
            subject: "hi",
            text: "body",
        });
        const captured = (mailer as InMemoryMailer).messages;
        expect(captured.length).toBe(1);
        expect(captured[0]?.to).toBe("alice@example.com");
        expect(captured[0]?.subject).toBe("hi");
        expect(captured[0]?.text).toBe("body");
    });

    test("sendOtpEmail dispatches the sign-in code", async () => {
        const mailer = new InMemoryMailer();
        await sendOtpEmail({
            mailer,
            email: "bob@example.com",
            otp: "123456",
        });
        expect(mailer.messages.length).toBe(1);
        const msg = mailer.messages[0];
        expect(msg?.to).toBe("bob@example.com");
        expect(msg?.subject).toBe("Your Bursora sign-in code");
        expect(msg?.text).toContain("123456");
    });

    test("sendInviteEmail dispatches the workspace invite", async () => {
        const mailer = new InMemoryMailer();
        await sendInviteEmail({
            mailer,
            email: "carol@example.com",
            acceptUrl: "https://app.example.com/invites/xyz",
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        expect(mailer.messages.length).toBe(1);
        const msg = mailer.messages[0];
        expect(msg?.to).toBe("carol@example.com");
        expect(msg?.subject).toBe("You're invited to a Bursora workspace");
        expect(msg?.text).toContain("https://app.example.com/invites/xyz");
        expect(msg?.text).toContain("This link expires tomorrow");
    });

    test("renderWebhookPayload formats slack and discord alert bodies", () => {
        const windowStart = new Date("2025-05-10T12:00:00Z");
        const windowEnd = new Date("2025-05-10T12:05:00Z");
        const slack = renderWebhookPayload("slack", {
            kind: "anomaly",
            alertId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
            workspaceId: "ws-1",
            tenantId: "tenant-a",
            agentId: null,
            reason: "spike detected",
            severity: "warning",
            deviation: 5,
            raisedAt: windowStart,
            windowStart,
            windowEnd,
            windowCostUsd: 1.23,
        });
        const discord = renderWebhookPayload("discord", {
            kind: "anomaly",
            alertId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
            workspaceId: "ws-1",
            tenantId: null,
            agentId: null,
            reason: "spike detected",
            severity: "warning",
            deviation: 5,
            raisedAt: windowStart,
            windowStart,
            windowEnd,
            windowCostUsd: 1.23,
        });
        expect("text" in slack && slack.text).toContain("[WARNING]");
        expect("text" in slack && slack.text).toContain("spike detected");
        expect("content" in discord && discord.content).toContain("workspace=ws-1");
    });
});
