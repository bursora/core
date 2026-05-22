/**
 * Pure helpers for the dashboard status strip.
 *
 * All helpers are deterministic and IO-free so the StatusStrip server
 * component just composes data sources and lets these decide the display
 * tone.
 */

import type { ChannelHealthRow } from "@/lib/notifications";

export type HeartbeatTone = "success" | "warning" | "destructive" | "muted";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DESTRUCTIVE_FAILURE_THRESHOLD = 3;

/**
 * Maps "time since last usage event" to a semantic tone for the SDK
 * heartbeat dot. `null` means the workspace has never recorded an event;
 * the strip surfaces this as a muted "no events yet" label.
 */
export function heartbeatTone(lastAt: Date | null, now: Date): HeartbeatTone {
    if (lastAt === null) return "muted";
    const ageMs = now.getTime() - lastAt.getTime();
    if (ageMs < FIVE_MINUTES_MS) return "success";
    if (ageMs < ONE_HOUR_MS) return "warning";
    return "destructive";
}

export type ChannelTone = "success" | "warning" | "destructive";

/**
 * Maps a channel's recent delivery health to a status-strip dot tone.
 *
 *   success:     last delivery was ok inside the past hour
 *   destructive: 3+ failures in the last 24h, OR last attempt failed
 *                and was over an hour ago (so no recovery), OR no
 *                attempt in over 24h (including "configured but never
 *                delivered")
 *   warning:     everything else (stale-but-not-broken, single fresh
 *                failure that may still recover)
 */
export function channelTone(row: ChannelHealthRow, now: Date): ChannelTone {
    const lastAttemptMs = row.lastAttemptAt?.getTime() ?? null;
    const ageMs = lastAttemptMs === null ? null : now.getTime() - lastAttemptMs;

    if (row.lastStatus === "ok" && ageMs !== null && ageMs < ONE_HOUR_MS) {
        return "success";
    }

    if (row.recentFailureCount >= DESTRUCTIVE_FAILURE_THRESHOLD) return "destructive";
    if (ageMs === null || ageMs > ONE_DAY_MS) return "destructive";
    if (row.lastStatus === "failed" && ageMs >= ONE_HOUR_MS) return "destructive";

    return "warning";
}
