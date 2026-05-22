/**
 * Tests for the recordNotificationDelivery use case.
 *
 * Wraps a `notification_deliveries` insert with two non-negotiables:
 *   - SHA-256 hash the destination (webhook URL or email address; never
 *     the raw value).
 *   - Truncate `error.message` to 500 chars on the way in.
 *
 * The dispatcher calls it on every Slack / Discord / email attempt —
 * both success and failure.
 */

import type {
    InsertNotificationDeliveryInput,
    NotificationDeliveriesWriter,
} from "@/lib/notifications/notification-deliveries.repository";
import { recordNotificationDelivery } from "@/lib/notifications/record-notification-delivery";
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";

class CapturingWriter implements NotificationDeliveriesWriter {
    readonly inserts: InsertNotificationDeliveryInput[] = [];
    async insert(input: InsertNotificationDeliveryInput): Promise<void> {
        this.inserts.push(input);
    }
}

const sha256Hex = (s: string): string => createHash("sha256").update(s).digest("hex");

describe("recordNotificationDelivery", () => {
    test("inserts an ok row with the SHA-256 of the target", async () => {
        const writer = new CapturingWriter();
        const url = "https://hooks.slack.com/services/T/B/abc";

        await recordNotificationDelivery({
            writer,
            workspaceId: WORKSPACE,
            kind: "slack",
            target: url,
            status: "ok",
            error: null,
            latencyMs: 142,
        });

        expect(writer.inserts).toHaveLength(1);
        const row = writer.inserts[0];
        expect(row?.workspaceId).toBe(WORKSPACE);
        expect(row?.kind).toBe("slack");
        expect(row?.status).toBe("ok");
        expect(row?.error).toBeNull();
        expect(row?.latencyMs).toBe(142);
        expect(row?.targetHash).toBe(sha256Hex(url));
        // SHA-256 hex is exactly 64 lowercase chars.
        expect(row?.targetHash).toMatch(/^[0-9a-f]{64}$/);
        // The raw URL must never appear in the persisted column.
        expect(row?.targetHash).not.toContain("hooks.slack.com");
    });

    test("inserts a failed row with the error truncated to 500 chars", async () => {
        const writer = new CapturingWriter();
        const longError = "x".repeat(1200);

        await recordNotificationDelivery({
            writer,
            workspaceId: WORKSPACE,
            kind: "discord",
            target: "https://discord.com/api/webhooks/xyz",
            status: "failed",
            error: longError,
            latencyMs: 5000,
        });

        expect(writer.inserts).toHaveLength(1);
        expect(writer.inserts[0]?.status).toBe("failed");
        expect(writer.inserts[0]?.error).toHaveLength(500);
        expect(writer.inserts[0]?.error?.startsWith("x".repeat(500))).toBe(true);
    });

    test("passes short error messages through untouched", async () => {
        const writer = new CapturingWriter();
        await recordNotificationDelivery({
            writer,
            workspaceId: WORKSPACE,
            kind: "slack",
            target: "https://hooks.slack.com/abc",
            status: "failed",
            error: "401 Unauthorized",
            latencyMs: 88,
        });
        expect(writer.inserts[0]?.error).toBe("401 Unauthorized");
    });

    test("hashes an email address as target", async () => {
        const writer = new CapturingWriter();
        const address = "alerts@example.com";

        await recordNotificationDelivery({
            writer,
            workspaceId: WORKSPACE,
            kind: "email",
            target: address,
            status: "ok",
            error: null,
            latencyMs: 230,
        });

        expect(writer.inserts).toHaveLength(1);
        const row = writer.inserts[0];
        expect(row?.kind).toBe("email");
        expect(row?.targetHash).toBe(sha256Hex(address));
        expect(row?.targetHash).toMatch(/^[0-9a-f]{64}$/);
        expect(row?.targetHash).not.toContain("example.com");
    });
});
