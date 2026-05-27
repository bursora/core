/**
 * General workspace settings: name, environment, spike protection (one form),
 * plus read-only workspace details and the owner-only danger zone.
 */

import { CopyButton } from "@/components/ui/copy-button";
import { DashboardSection } from "@/components/ui/workspace/dashboard-section";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { getWorkspace } from "@/lib/identity/server";
import { resolveSpikeSettings } from "@/lib/spike-protection/server";
import { notFound } from "next/navigation";
import { DeleteWorkspaceDialog } from "./delete-workspace-dialog";
import { GeneralSettingsForm } from "./general-settings-form";

interface GeneralSectionProps {
    readonly workspaceId: string;
    readonly isOwner: boolean;
}

export async function GeneralSection({ workspaceId, isOwner }: GeneralSectionProps) {
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) notFound();

    const spike = env().IS_CLOUD
        ? await resolveSpikeSettings(workspaceId).then((s) => ({
              enabled: s.enabled,
              multiplier: s.thresholdMultiplier,
          }))
        : null;

    return (
        <div className="space-y-6">
            <GeneralSettingsForm
                workspaceId={workspaceId}
                currentName={workspace.name}
                currentEnvironment={workspace.environment}
                spike={spike}
            />

            <DashboardSection
                label="Workspace details"
                sublabel="reference info for sdk config and support"
            >
                <div className="space-y-4">
                    <FieldRow label="Workspace ID">
                        <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm">
                            {workspace.id}
                        </code>
                        <CopyButton value={workspace.id} label="Copy ID" />
                    </FieldRow>
                    <FieldRow label="Created">
                        <span className="text-sm">{formatDate(workspace.createdAt)}</span>
                    </FieldRow>
                </div>
            </DashboardSection>

            {isOwner ? (
                <section className="rounded-[8px] border border-destructive/40 bg-background p-5">
                    <h2 className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-destructive">
                        Danger zone
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Deleting the workspace removes all members, API keys, budgets, pricing
                        overrides, alert channels, and usage history. This cannot be undone.
                    </p>
                    <div className="mt-4">
                        <DeleteWorkspaceDialog
                            workspaceId={workspaceId}
                            workspaceName={workspace.name}
                        />
                    </div>
                </section>
            ) : null}
        </div>
    );
}

function FieldRow({
    label,
    children,
}: {
    readonly label: string;
    readonly children: React.ReactNode;
}) {
    return (
        <div className="space-y-1">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground/70">
                {label}
            </div>
            <div className="flex items-center gap-2">{children}</div>
        </div>
    );
}
