/**
 * Cloud-only settings panel for the event bundle. Renders the current
 * usage (events, overage, bundle remaining) and a hard-cap toggle. Self-
 * host installs never see this section — the parent gates on `IS_CLOUD`.
 */

import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { readEventBundleStatus } from "@/lib/event-bundle/server";
import { EventBundleForm } from "./event-bundle-form";

interface EventBundleSectionProps {
    readonly workspaceId: string;
}

export async function EventBundleSection({ workspaceId }: EventBundleSectionProps) {
    const status = await readEventBundleStatus(workspaceId);
    return (
        <DashboardSection label="Event bundle" sublabel="5M events included · $0.30 / 1K overage">
            <EventBundleForm
                workspaceId={workspaceId}
                initialHardCapUsd={
                    status.hardCapUsdCents === null
                        ? null
                        : Math.round(status.hardCapUsdCents / 100)
                }
                eventsCount={status.eventsCount}
                overageCents={status.overageCents}
                bundleEvents={status.bundleEvents}
            />
        </DashboardSection>
    );
}
