/**
 * Pure URL scrubber for client analytics. The PostHog provider is root-mounted,
 * so URL-bearing autocapture/pageview props (`$current_url`, `$pathname`,
 * `$referrer`) can carry a live invite token (`/invite/<token>` is a 24h
 * workspace-join secret) or a `next=` param pointing back at one. Strip both
 * before any event leaves the browser; leave every other URL byte-for-byte.
 *
 * Operates on raw strings (relative paths or absolute URLs), not the URL class,
 * so it never normalizes or reorders the rest of the string.
 */

const INVITE_TOKEN = /\/invite\/[^/?#]+/g;
const NEXT_PARAM = /([?&]next=)[^&#]*/gi;

export function redactSensitiveUrl(url: string): string {
    if (!url) return url;
    return url.replace(INVITE_TOKEN, "/invite/[token]").replace(NEXT_PARAM, "$1[redacted]");
}
