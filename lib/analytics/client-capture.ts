"use client";

/**
 * Client-side funnel capture. No-ops when PostHog was never initialized (no
 * `POSTHOG_KEY`, so the provider skipped init), so self-host never sends an
 * event. Keeps no PII in properties — callers pass plan/edition flags, never
 * email or raw ids.
 */

import posthog from "posthog-js";
import type { FunnelEvent } from "./events";

export function captureClientEvent(
    event: FunnelEvent,
    properties?: Readonly<Record<string, string | number | boolean>>,
): void {
    if (!posthog.__loaded) return;
    posthog.capture(event, properties);
}
