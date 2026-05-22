/**
 * HTTP webhook sender — shared by Slack and Discord.
 *
 * Both Slack and Discord incoming webhooks accept a POST with
 * `content-type: application/json` and a JSON body. The body shape
 * differs (Slack: `{ text }`, Discord: `{ content }`) but that's
 * decided upstream by `renderWebhookPayload(channel, event)` — the
 * sender itself is agnostic.
 *
 * 5s timeout protects the cron from a slow webhook target. The
 * dispatcher catches throws so one failing channel never blocks the
 * others.
 */

import type { WebhookSender } from "./webhook-sender";

const TIMEOUT_MS = 5000;

export const httpWebhookSender: WebhookSender = {
    post: async (url: string, body: unknown): Promise<void> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            if (!res.ok) {
                throw new Error(`webhook returned ${res.status}`);
            }
        } finally {
            clearTimeout(timer);
        }
    },
};
