"use server";

import { requireAdminUI } from "@/lib/auth";
import { env } from "@/lib/env";
import { defaultSmtpMailer } from "@/lib/notification";
import { redisClient } from "@/lib/redis/client";
import * as Sentry from "@sentry/nextjs";

export type TestActionResult = { ok: true; detail?: string } | { ok: false; error: string };

const COOLDOWN_SECONDS = 60;

/**
 * Per-user, per-action cooldown via Redis so an admin can't hammer the shared
 * mailer or Sentry ingest. Fail-open: a Redis hiccup must not block the tool.
 */
async function onCooldown(userId: string, action: string): Promise<boolean> {
    try {
        const set = await redisClient(env().REDIS_URL).set(
            `system-status:${action}:${userId}`,
            "1",
            "EX",
            COOLDOWN_SECONDS,
            "NX",
        );
        return set === null;
    } catch (error: unknown) {
        console.error("system-status.cooldown.error", error);
        return false;
    }
}

/** Send a test email to the signed-in admin's own address. Admin-gated, throttled. */
export async function sendTestEmailAction(): Promise<TestActionResult> {
    const session = await requireAdminUI();
    if (await onCooldown(session.user.id, "test-email")) {
        return { ok: false, error: "Wait a minute before sending another test email." };
    }
    try {
        await defaultSmtpMailer().send({
            to: session.user.email,
            subject: "Bursora — SMTP test email",
            text: "Test email from your Bursora system status page. If you received it, SMTP delivery works.",
            html: "<p>Test email from your Bursora system status page. If you received it, SMTP delivery works.</p>",
        });
        return { ok: true, detail: `Test email sent to ${session.user.email}` };
    } catch (error: unknown) {
        console.error("system-status.test-email.error", error);
        return { ok: false, error: "Send failed — see the SMTP card and server logs." };
    }
}

/** Send a test event to Sentry and flush it. Admin-gated, throttled. */
export async function sendTestSentryEventAction(): Promise<TestActionResult> {
    const session = await requireAdminUI();
    if (!Sentry.isInitialized()) {
        return { ok: false, error: "Sentry is not initialized in this server." };
    }
    if (await onCooldown(session.user.id, "test-sentry")) {
        return { ok: false, error: "Wait a minute before sending another test event." };
    }
    Sentry.captureMessage("Bursora system status — test event", {
        level: "info",
        tags: { healthcheck: "true" },
    });
    const flushed = await Sentry.flush(2_000);
    return flushed
        ? { ok: true, detail: "Test event sent to Sentry." }
        : { ok: false, error: "Captured, but flush timed out — verify ingestion in Sentry." };
}
