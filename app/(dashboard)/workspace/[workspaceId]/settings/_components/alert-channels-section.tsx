/**
 * Alert channels panel for /settings.
 *
 * Loads the workspace's saved Slack/Discord webhook URLs and alert email
 * and renders the form. Saved channels receive both anomaly and budget
 * crossing notifications.
 */

import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { requireSessionUI } from "@/lib/auth";
import { listAlertChannelsForWorkspace } from "@/lib/compose/settings";
import { AlertChannelsForm } from "./alert-channels-form";

interface AlertChannelsSectionProps {
    workspaceId: string;
    saved: boolean;
}

export async function AlertChannelsSection({ workspaceId, saved }: AlertChannelsSectionProps) {
    const [channels, session] = await Promise.all([
        listAlertChannelsForWorkspace(workspaceId),
        requireSessionUI(),
    ]);

    return (
        <DashboardSection
            label="Alert channels"
            sublabel="webhooks and email receive anomaly + budget notifications"
        >
            <div className="space-y-4">
                {saved ? <p className="text-sm text-success">Channels saved.</p> : null}
                <AlertChannelsForm
                    workspaceId={workspaceId}
                    slackUrl={channels.slack?.url ?? ""}
                    discordUrl={channels.discord?.url ?? ""}
                    emailAddress={channels.email?.address ?? ""}
                    userEmail={session.user.email}
                />
            </div>
        </DashboardSection>
    );
}
