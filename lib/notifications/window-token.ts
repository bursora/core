/**
 * Anomaly notification bodies are persisted server-side at fan-out time, before
 * any viewer (and their timezone) is known. So instead of baking the spike
 * window as a fixed UTC string, the body carries a tz-neutral token; the read
 * path localizes it in the viewer's zone (see `listNotifications`).
 *
 * The token never reaches a user un-substituted: every read path that returns a
 * body runs `localizeNotificationBody` (worst case in UTC). Outbound channels
 * (webhook/email/Slack) format the window from the event directly and are
 * unaffected.
 */

import { formatWindowLine, type WindowLine } from "../format";
import { UTC } from "../time/zone";

const WINDOW_TOKEN_RE = /\[\[win:(\d+):(\d+):([\d.]+)\]\]/g;

/** Encodes a spike window as a tz-neutral token for an in-app notification body. */
export function encodeWindowToken(window: WindowLine): string {
    // Fixed notation, not the default `${number}`: a sub-microcent cost would
    // stringify to exponential ("1e-8"), which the decode regex can't match,
    // leaving the raw token in the rendered body. The column is numeric(14,8),
    // so 8 dp is lossless.
    const cost = window.windowCostUsd.toFixed(8);
    return `[[win:${window.windowStart.getTime()}:${window.windowEnd.getTime()}:${cost}]]`;
}

/** Renders any window tokens in `body` as a localized window line in `tz`. */
export function localizeNotificationBody(body: string, tz: string = UTC): string {
    return body.replace(WINDOW_TOKEN_RE, (_match, startMs: string, endMs: string, cost: string) =>
        formatWindowLine(
            {
                windowStart: new Date(Number(startMs)),
                windowEnd: new Date(Number(endMs)),
                windowCostUsd: Number(cost),
            },
            tz,
        ),
    );
}
