/**
 * Top-of-dashboard banner for the cloud event bundle.
 *
 * Stacks with the rate-limit banner (`./rate-limit-banner.tsx`): both are
 * mounted as separate Suspense slots in the workspace layout. This one
 * renders only when `bannerLevel` !== "none", and reuses the shared
 * `Alert` component so the visual language stays consistent.
 *
 * Self-host: `readEventBundleStatus` returns `enabled: false` and the
 * component renders nothing.
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { readEventBundleStatus, type EventBundleStatus } from "@/lib/event-bundle/server";
import { formatCount, formatUsd } from "@/lib/format";
import { Boxes } from "lucide-react";

interface EventBundleBannerProps {
    readonly workspaceId: string;
}

export async function EventBundleBanner({ workspaceId }: EventBundleBannerProps) {
    const status = await readEventBundleStatus(workspaceId);
    if (!status.enabled) return null;
    if (status.bannerLevel === "none") return null;

    const variant = status.bannerLevel === "heavy" ? "destructive" : "warning";
    return (
        <Alert variant={variant}>
            <Boxes />
            <AlertTitle>{renderTitle(status)}</AlertTitle>
            <AlertDescription>
                <p>{renderBody(status)}</p>
            </AlertDescription>
        </Alert>
    );
}

function renderTitle(status: EventBundleStatus): string {
    if (status.hardCapHit) return "Hard cap reached, new events rejected";
    if (status.bannerLevel === "heavy") return "Heavy overage usage";
    if (status.bannerLevel === "exhausted") {
        return "Bundle exhausted. Now billing overage at $0.30/1K.";
    }
    return "Approaching event cap.";
}

function renderBody(status: EventBundleStatus): string {
    const events = formatCount(status.eventsCount);
    const bundle = formatCount(status.bundleEvents);
    const overage = formatUsd(status.overageCents / 100);

    if (status.hardCapHit && status.hardCapUsdCents !== null) {
        const cap = formatUsd(status.hardCapUsdCents / 100);
        return `${events} / ${bundle} this cycle. Overage ${overage} (hard cap ${cap}).`;
    }
    if (status.bannerLevel === "approaching") {
        return `${events} / ${bundle} this cycle. $0.30/1K above the bundle.`;
    }
    return `${events} / ${bundle} this cycle. Overage accrued ${overage}.`;
}
