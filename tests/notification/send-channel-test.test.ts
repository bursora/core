/**
 * Tests for the send-channel-test use case (the "Send test" button).
 *
 * Slack -> WebhookSender with `{ text }`, Discord -> `{ content }`,
 * email -> Mailer. Send failures propagate so the action can surface them.
 */

import { InMemoryMailer } from "@/lib/notification/send";
import { sendChannelTest } from "@/lib/notification/send-channel-test.usecase";
import type { WebhookSender } from "@/lib/notification/webhook-sender";
import { describe, expect, test } from "bun:test";

interface PostCall {
    readonly url: string;
    readonly body: unknown;
}

function fakeSender(onPost?: () => Promise<void>): { sender: WebhookSender; calls: PostCall[] } {
    const calls: PostCall[] = [];
    const sender: WebhookSender = {
        post: async (url, body) => {
            calls.push({ url, body });
            if (onPost) await onPost();
        },
    };
    return { sender, calls };
}

describe("sendChannelTest", () => {
    test("slack posts a text body to the webhook URL, never email or a content field", async () => {
        const { sender, calls } = fakeSender();
        const mailer = new InMemoryMailer();

        await sendChannelTest(
            { sender, mailer },
            { kind: "slack", target: "https://hooks.slack.com/services/x" },
        );

        expect(calls).toHaveLength(1);
        expect(calls[0]?.url).toBe("https://hooks.slack.com/services/x");
        const body = calls[0]?.body as Record<string, unknown>;
        expect(body.text).toContain("Bursora");
        expect(body.content).toBeUndefined();
        expect(mailer.messages).toHaveLength(0);
    });

    test("discord posts a content body, never a slack-style text field", async () => {
        const { sender, calls } = fakeSender();

        await sendChannelTest(
            { sender, mailer: new InMemoryMailer() },
            { kind: "discord", target: "https://discord.com/api/webhooks/1/x" },
        );

        const body = calls[0]?.body as Record<string, unknown>;
        expect(body.content).toContain("Bursora");
        expect(body.text).toBeUndefined();
    });

    test("email goes to the typed address via the mailer, not the webhook sender", async () => {
        const { sender, calls } = fakeSender();
        const mailer = new InMemoryMailer();

        await sendChannelTest({ sender, mailer }, { kind: "email", target: "ops@acme.test" });

        expect(calls).toHaveLength(0);
        expect(mailer.messages).toHaveLength(1);
        expect(mailer.messages[0]?.to).toBe("ops@acme.test");
        expect(mailer.messages[0]?.subject).toContain("Bursora");
        expect((mailer.messages[0]?.text ?? "").length).toBeGreaterThan(0);
    });

    test("a webhook failure propagates to the caller", async () => {
        const { sender } = fakeSender(() => Promise.reject(new Error("webhook returned 404")));

        await expect(
            sendChannelTest(
                { sender, mailer: new InMemoryMailer() },
                { kind: "slack", target: "https://hooks.slack.com/services/dead" },
            ),
        ).rejects.toThrow("webhook returned 404");
    });
});
