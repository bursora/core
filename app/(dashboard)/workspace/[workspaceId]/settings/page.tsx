import { PageHeader } from "@/components/shell/page-header";
import { requireSessionUI } from "@/lib/auth";
import { env } from "@/lib/env";
import { assertWorkspaceMemberOrNotFound } from "@/lib/identity/server";
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
        billing?: string;
        channelsSaved?: string;
        tab?: string;
        kind?: string;
        severity?: string;
        from?: string;
        to?: string;
        cursor?: string;
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
    const channelsSaved = search.channelsSaved === "1";
    const billingStatus =
        search.billing === "ok" || search.billing === "cancel"
            ? (search.billing as "ok" | "cancel")
            : null;
    const tabs = isCloud
        ? (["general", "billing", "pricing", "channels", "activity"] as const)
        : (["general", "pricing", "channels", "activity"] as const);
    const activeTab = resolveSettingsTab(search.tab, tabs);

    const isOss = process.env.OSS_BUILD === "true";
    const BillingSection =
        isCloud && !isOss
            ? (await import("@/lib/ee/components/billing-section")).BillingSection
            : null;

    return (
        <div className="space-y-6">
            <PageHeader
                title="Settings"
                subtitle={
                    isCloud
                        ? "Workspace profile, billing, pricing overrides, and alert channels."
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
                    ...(isCloud && BillingSection
                        ? {
                              billing: (
                                  <div className="space-y-6">
                                      <BillingSection
                                          workspaceId={workspaceId}
                                          status={billingStatus}
                                          isOwner={membership.role === "owner"}
                                      />
                                      <EventBundleSection workspaceId={workspaceId} />
                                  </div>
                              ),
                          }
                        : {}),
                    pricing: <PricingOverrideSection workspaceId={workspaceId} />,
                    channels: (
                        <AlertChannelsSection workspaceId={workspaceId} saved={channelsSaved} />
                    ),
                    activity: (
                        <ActivityTab
                            workspaceId={workspaceId}
                            searchParams={{
                                ...(search.kind !== undefined ? { kind: search.kind } : {}),
                                ...(search.severity !== undefined
                                    ? { severity: search.severity }
                                    : {}),
                                ...(search.from !== undefined ? { from: search.from } : {}),
                                ...(search.to !== undefined ? { to: search.to } : {}),
                                ...(search.cursor !== undefined ? { cursor: search.cursor } : {}),
                            }}
                        />
                    ),
                }}
            />
        </div>
    );
}
