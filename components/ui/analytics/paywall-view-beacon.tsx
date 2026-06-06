"use client";

/**
 * Fires `paywall_viewed` once when the cloud paywall renders. Client-only so it
 * can reach the initialized PostHog instance; no-ops when analytics is off.
 * Carries one non-identifying flag (whether the viewer is the workspace owner),
 * never any PII.
 */

import { captureClientEvent } from "@/lib/analytics/client-capture";
import { useEffect } from "react";

export function PaywallViewBeacon({ isOwner }: { isOwner: boolean }) {
    useEffect(() => {
        captureClientEvent("paywall_viewed", { is_owner: isOwner });
    }, [isOwner]);
    return null;
}
