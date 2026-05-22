/**
 * Pure validators for /settings forms. Shared between the form components
 * and the unit tests. Server use cases re-validate; these are UX shortcuts.
 */

import { isValidEmail } from "@/lib/email";

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
