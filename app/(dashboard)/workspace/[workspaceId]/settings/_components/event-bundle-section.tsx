/**
 * Cloud-only settings panel for the event bundle. Shows the current cycle's
 * usage against the fixed 5M-events/month fair-use cap. Self-host installs
 * never see this section — the parent gates on `IS_CLOUD`.
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
        <DashboardSection label="Event bundle" sublabel="this cycle">
            <EventBundleForm
                eventsCount={status.eventsCount}
                bundleEvents={status.bundleEvents}
                level={status.bannerLevel}
            />
        </DashboardSection>
    );
}
