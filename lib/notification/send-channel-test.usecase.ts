/**
 * Send a test message to a single alert channel.
 *
 * Drives the dashboard "Send test" button: a member pastes a webhook URL
 * or email address and fires one ping to confirm the wire works before
 * saving. The target is the value the member typed, not a persisted
 * channel, so callers gate access (workspace membership) and validate the
 * shape upstream. Slack reads `text`, Discord reads `content` — the same
 * webhook shapes the live dispatcher sends. The email test is a plain-text
 * ping (the real alert email is a rendered template); the point is to prove
 * the address receives mail, not to mirror the alert layout.
 */

import type { Mailer } from "./send";
import type { WebhookSender } from "./webhook-sender";

export type TestChannelKind = "slack" | "discord" | "email";

const TEST_MESSAGE = "Bursora test alert. Your channel is connected; real alerts land here.";
const TEST_SUBJECT = "[Bursora] Test alert";

export interface SendChannelTestDeps {
    readonly sender: WebhookSender;
    readonly mailer: Mailer;
}

export interface SendChannelTestInput {
    readonly kind: TestChannelKind;
    readonly target: string;
}

export async function sendChannelTest(
    deps: SendChannelTestDeps,
    input: SendChannelTestInput,
): Promise<void> {
    if (input.kind === "email") {
        await deps.mailer.send({ to: input.target, subject: TEST_SUBJECT, text: TEST_MESSAGE });
        return;
    }
    const body = input.kind === "slack" ? { text: TEST_MESSAGE } : { content: TEST_MESSAGE };
    await deps.sender.post(input.target, body);
}
