/**
 * Persists one `notification_deliveries` row for a Slack / Discord post
 * or an email send.
 *
 * Two invariants the dispatcher relies on us to enforce:
 *   - The raw destination (webhook URL or email address) is hashed to
 *     SHA-256 hex before write. Raw secrets / PII MUST NOT reach the
 *     table; the param name keeps that explicit.
 *   - `error` is truncated to 500 chars at write time so a noisy
 *     upstream body can't blow up rows.
 */

import { createHash } from "node:crypto";
import type { NotificationChannelKind, NotificationDeliveryStatus } from "./channel-health";
import type { NotificationDeliveriesWriter } from "./notification-deliveries.repository";

const ERROR_MAX_LEN = 500;

export interface RecordNotificationDeliveryInput {
    readonly writer: NotificationDeliveriesWriter;
    readonly workspaceId: string;
    readonly kind: NotificationChannelKind;
    /** Raw webhook URL or email address. Hashed on write; never stored as-is. */
    readonly target: string;
    readonly status: NotificationDeliveryStatus;
    readonly error: string | null;
    readonly latencyMs: number | null;
}

export async function recordNotificationDelivery(
    input: RecordNotificationDeliveryInput,
): Promise<void> {
    await input.writer.insert({
        workspaceId: input.workspaceId,
        kind: input.kind,
        targetHash: createHash("sha256").update(input.target).digest("hex"),
        status: input.status,
        error: truncate(input.error, ERROR_MAX_LEN),
        latencyMs: input.latencyMs,
    });
}

function truncate(value: string | null, max: number): string | null {
    if (value === null) return null;
    return value.length <= max ? value : value.slice(0, max);
}
