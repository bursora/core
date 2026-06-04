import { PageHeader } from "@/components/shell/page-header";
import { CloudPaywall } from "@/components/ui/workspace/cloud-paywall";
import { requireSessionUI } from "@/lib/auth";
import { cloudWorkspaceLocked } from "@/lib/billing-gate/server";
import { env } from "@/lib/env";
import { assertWorkspaceMemberOrNotFound } from "@/lib/identity/server";
import { resolveCloudPaywallData } from "../_components/cloud-paywall-data";
import { ActivityTab } from "./_components/activity-tab";
import { AlertChannelsSection } from "./_components/alert-channels-section";
import { EventBundleSection } from "./_components/event-bundle-section";
import { GeneralSection } from "./_components/general-section";
import { PricingOverrideSection } from "./_components/pricing-override-section";
import { TabsClient } from "./_components/tabs-client";
import { resolveSettingsTab } from "./tabs";

interface SettingsPageProps {
    params: Promise<{ workspaceId: string }>;
    searchParams: Promise<{
        channelsSaved?: string;
        tab?: string;
        kind?: string;
        severity?: string;
        from?: string;
        to?: string;
        shown?: string;
        pricing_q?: string;
        pricing_provider?: string;
        pricing_status?: string;
        pricing_source?: string;
        pricing_page?: string;
    }>;
}

export default async function SettingsPage({ params, searchParams }: SettingsPageProps) {
    const { workspaceId } = await params;
    const search = await searchParams;
    const session = await requireSessionUI();
    const membership = await assertWorkspaceMemberOrNotFound({
        workspaceId,
        userId: session.user.id,
    });

    const isCloud = env().IS_CLOUD;
    // Settings stays reachable so a locked workspace can pay (Billing tab), but
    // the Activity log is real workspace data (incl. alert_raised) — gate it.
    const locked = await cloudWorkspaceLocked(workspaceId);
    const paywall = locked ? await resolveCloudPaywallData(workspaceId, session.user.id) : null;
    const channelsSaved = search.channelsSaved === "1";
    const tabs = isCloud
        ? (["general", "usage", "pricing", "channels", "activity"] as const)
        : (["general", "pricing", "channels", "activity"] as const);
    const activeTab = resolveSettingsTab(search.tab, tabs);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Settings"
                subtitle={
                    isCloud
                        ? "Workspace profile, usage, pricing overrides, and alert channels."
                        : "Workspace profile, pricing overrides, and alert channels."
                }
            />

            <TabsClient
                workspaceId={workspaceId}
                activeTab={activeTab}
                tabs={tabs}
                panels={{
                    general: (
                        <GeneralSection
                            workspaceId={workspaceId}
                            isOwner={membership.role === "owner"}
                        />
                    ),
                    ...(isCloud
                        ? {
                              usage: <EventBundleSection workspaceId={workspaceId} />,
                          }
                        : {}),
                    pricing: (
                        <PricingOverrideSection
                            workspaceId={workspaceId}
                            searchParams={{
                                ...(search.pricing_q !== undefined
                                    ? { pricing_q: search.pricing_q }
                                    : {}),
                                ...(search.pricing_provider !== undefined
                                    ? { pricing_provider: search.pricing_provider }
                                    : {}),
                                ...(search.pricing_status !== undefined
                                    ? { pricing_status: search.pricing_status }
                                    : {}),
                                ...(search.pricing_source !== undefined
                                    ? { pricing_source: search.pricing_source }
                                    : {}),
                                ...(search.pricing_page !== undefined
                                    ? { pricing_page: search.pricing_page }
                                    : {}),
                            }}
                        />
                    ),
                    channels: (
                        <AlertChannelsSection workspaceId={workspaceId} saved={channelsSaved} />
                    ),
                    activity:
                        locked && paywall ? (
                            <CloudPaywall {...paywall} />
                        ) : (
                            <ActivityTab
                                workspaceId={workspaceId}
                                searchParams={{
                                    ...(search.kind !== undefined ? { kind: search.kind } : {}),
                                    ...(search.severity !== undefined
                                        ? { severity: search.severity }
                                        : {}),
                                    ...(search.from !== undefined ? { from: search.from } : {}),
                                    ...(search.to !== undefined ? { to: search.to } : {}),
                                    ...(search.shown !== undefined ? { shown: search.shown } : {}),
                                }}
                            />
                        ),
                }}
            />
        </div>
    );
}
