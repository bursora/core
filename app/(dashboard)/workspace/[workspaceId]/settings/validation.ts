/**
 * Pure validators for /settings forms. Shared between the form components
 * and the unit tests. Server use cases re-validate; these are UX shortcuts.
 */

import { isValidEmail } from "@/lib/email";
import type { TestChannelKind } from "@/lib/notification/send-channel-test.usecase";

const SLACK_PREFIX = "https://hooks.slack.com/";
const DISCORD_PREFIXES = [
    "https://discord.com/api/webhooks/",
    "https://discordapp.com/api/webhooks/",
] as const;

export const SLACK_HINT = `must start with ${SLACK_PREFIX}`;
export const DISCORD_HINT = `must start with ${DISCORD_PREFIXES[0]} or ${DISCORD_PREFIXES[1]}`;
export const EMAIL_HINT = "must be a valid email address";

export function isValidAlertEmail(value: string): boolean {
    return value.length === 0 || isValidEmail(value);
}

export function isNonNegativeDecimal(value: string): boolean {
    if (value.length === 0) return false;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0;
}

export function isValidSlackUrl(url: string): boolean {
    return url.length === 0 || url.startsWith(SLACK_PREFIX);
}

export function isValidDiscordUrl(url: string): boolean {
    return url.length === 0 || DISCORD_PREFIXES.some((p) => url.startsWith(p));
}

export type ChannelTestValidation =
    | { readonly ok: true; readonly kind: TestChannelKind }
    | { readonly ok: false; readonly error: string };

/**
 * Validates a "Send test" request: known channel kind + a non-empty target
 * whose shape matches that kind. Returns the narrowed kind on success or a
 * user-facing message on failure. The server action calls this before any
 * network/SMTP I/O; the same prefix/email checks back the live save path.
 */
export function validateChannelTestTarget(kind: string, target: string): ChannelTestValidation {
    if (target.trim().length === 0) {
        return { ok: false, error: "Add a destination before testing." };
    }
    if (kind === "slack") {
        return isValidSlackUrl(target)
            ? { ok: true, kind }
            : { ok: false, error: "That isn't a Slack webhook URL." };
    }
    if (kind === "discord") {
        return isValidDiscordUrl(target)
            ? { ok: true, kind }
            : { ok: false, error: "That isn't a Discord webhook URL." };
    }
    if (kind === "email") {
        return isValidEmail(target)
            ? { ok: true, kind }
            : { ok: false, error: "That isn't a valid email address." };
    }
    return { ok: false, error: "Unknown channel." };
}

export interface PricingRangeInput {
    effectiveFrom: string;
    effectiveTo: string;
}

export function isValidEffectiveRange(input: Readonly<PricingRangeInput>): boolean {
    if (input.effectiveTo.length === 0) return true;
    const from = new Date(input.effectiveFrom).getTime();
    const to = new Date(input.effectiveTo).getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
    return to > from;
}
