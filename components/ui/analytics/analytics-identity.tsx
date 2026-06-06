"use client";

/**
 * Identifies the signed-in person to PostHog by a server-computed hashed id and,
 * when a workspace is in context, attaches the workspace group. The ids arrive
 * already hashed (`buildIdentity` server-side) so the client `distinct_id`
 * matches the server funnel events' `anonymousId` exactly — no client recompute,
 * no PII. No-ops when analytics is off (self-host never initialized PostHog).
 */

import type { Identity } from "@/lib/analytics/identity";
import posthog from "posthog-js";
import { useEffect } from "react";

export function AnalyticsIdentity({ distinctId, groupType, groupKey }: Identity) {
    useEffect(() => {
        if (!posthog.__loaded) return;
        posthog.identify(distinctId);
        if (groupKey) posthog.group(groupType, groupKey);
    }, [distinctId, groupType, groupKey]);

    return null;
}
