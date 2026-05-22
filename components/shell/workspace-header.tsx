/**
 * Sidebar header row. Mirrors the landing mockup
 * (`app/_components/landing/dashboard.tsx` lines 95-108): square workspace
 * avatar on the left, workspace name above a monospaced environment
 * sub-line, and a chevron pinned to the right.
 *
 * The full row is the switcher trigger — `<WorkspaceSwitcher />` wraps it
 * in a Popover and renders the chevron and command list.
 *
 * Stays a server component (no "use client") so the bulk of the chrome
 * stays static; only the switcher trigger ships JavaScript.
 */

import { WorkspaceSwitcher } from "@/components/shell/workspace-switcher";
import { WorkspaceAvatar } from "@/components/ui/workspace-avatar";
import type { WorkspaceOption } from "./app-shell-helpers";

interface WorkspaceHeaderProps {
    readonly workspaces: ReadonlyArray<WorkspaceOption>;
    readonly activeWorkspace: WorkspaceOption | null;
    readonly activeWorkspaceId: string | null;
}

export function WorkspaceHeader({
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
}: WorkspaceHeaderProps) {
    return (
        <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId}>
            {activeWorkspace ? (
                <>
                    <WorkspaceAvatar
                        name={activeWorkspace.name}
                        workspaceId={activeWorkspace.id}
                        size="md"
                    />
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                            {activeWorkspace.name}
                        </div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                            {activeWorkspace.environment}
                        </div>
                    </div>
                </>
            ) : (
                <span className="flex-1 truncate text-sm text-muted-foreground">
                    Select workspace
                </span>
            )}
        </WorkspaceSwitcher>
    );
}
