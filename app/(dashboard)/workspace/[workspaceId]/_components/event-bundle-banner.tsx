/**
 * Top-of-dashboard banner for the cloud event bundle's fair-use cap.
 *
 * Stacks with the rate-limit banner (`./rate-limit-banner.tsx`): both are
 * mounted as separate Suspense slots in the workspace layout. This one
 * renders only when `bannerLevel` !== "none", and reuses the shared
 * `Alert` component so the visual language stays consistent.
 *
 * The 5M events/month bundle is a fair-use cap, not a hard block: the banner
 * warns, it never announces rejected events. Self-host:
 * `readEventBundleStatus` returns `enabled: false` and the component renders
 * nothing.
 */

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { readEventBundleStatus, type EventBundleStatus } from "@/lib/event-bundle/server";
import { formatCount } from "@/lib/format";
import { Boxes } from "lucide-react";

interface EventBundleBannerProps {
    readonly workspaceId: string;
}

export async function EventBundleBanner({ workspaceId }: EventBundleBannerProps) {
    const status = await readEventBundleStatus(workspaceId);
    if (!status.enabled) return null;
    if (status.bannerLevel === "none") return null;

    return (
        <Alert variant="warning">
            <Boxes />
            <AlertTitle>{renderTitle(status)}</AlertTitle>
            <AlertDescription>
                <p>{renderBody(status)}</p>
            </AlertDescription>
        </Alert>
    );
}

function renderTitle(status: EventBundleStatus): string {
    if (status.bannerLevel === "exhausted") return "Fair-use cap reached.";
    return "Approaching the fair-use cap.";
}

function renderBody(status: EventBundleStatus): string {
    const events = formatCount(status.eventsCount);
    const bundle = formatCount(status.bundleEvents);
    if (status.bannerLevel === "exhausted") {
        return `${events} / ${bundle} events this cycle. Tracking keeps working; we'll reach out about your plan.`;
    }
    return `${events} / ${bundle} events this cycle.`;
}
