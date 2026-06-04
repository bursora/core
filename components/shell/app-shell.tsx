/**
 * Server-rendered chrome for the `(dashboard)` route group. Resolves the
 * authenticated user, lists their workspaces, picks the active one (URL >
 * cookie > first), then composes the shadcn Sidebar + header. All
 * interactive bits live in `*.client.tsx` siblings.
 */

import { GettingStartedWidget } from "@/app/(dashboard)/workspace/[workspaceId]/_components/getting-started-widget";
import { KeyboardShortcuts } from "@/components/shell/keyboard-shortcuts";
import { NotificationCenter } from "@/components/shell/notification-center";
import { ReactivatedToast } from "@/components/shell/reactivated-toast";
import { SidebarFirstRun } from "@/components/shell/sidebar-first-run";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { WorkspaceHeader } from "@/components/shell/workspace-header";
import { WorkspaceUrlSync } from "@/components/shell/workspace-url-sync";
import { Logo } from "@/components/ui/brand/logo";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar";
import { requireSessionUI } from "@/lib/auth";
import { env } from "@/lib/env";
import { USER_ROLE } from "@/lib/identity/user-role";
import { listWorkspacesForUser } from "@/lib/identity/workspaces-for-user";
import { cookies } from "next/headers";
import { Suspense, type ReactNode } from "react";
import { resolveActiveWorkspaceId, WORKSPACE_COOKIE } from "./app-shell-helpers";

interface AppShellProps {
    children: ReactNode;
    /** Workspace id from the URL path (when on `/workspace/[workspaceId]/...`). */
    urlWorkspaceId?: string;
}

export async function AppShell({ children, urlWorkspaceId }: AppShellProps) {
    const session = await requireSessionUI();
    const workspaces = await listWorkspacesForUser(session.user.id);
    const cookieStore = await cookies();
    const activeWorkspaceId = resolveActiveWorkspaceId({
        fromUrl: urlWorkspaceId,
        fromCookie: cookieStore.get(WORKSPACE_COOKIE)?.value,
        available: workspaces,
    });
    const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

    return (
        <SidebarProvider>
            <Sidebar collapsible="offcanvas">
                <SidebarHeader>
                    <WorkspaceHeader
                        workspaces={workspaces}
                        activeWorkspace={activeWorkspace}
                        activeWorkspaceId={activeWorkspaceId}
                    />
                </SidebarHeader>
                <SidebarContent>
                    {activeWorkspaceId ? (
                        <SidebarNav activeWorkspaceId={activeWorkspaceId} />
                    ) : (
                        <SidebarFirstRun />
                    )}
                </SidebarContent>
                <SidebarFooter className="gap-2">
                    {activeWorkspaceId ? (
                        <Suspense fallback={null}>
                            <GettingStartedWidget workspaceId={activeWorkspaceId} />
                        </Suspense>
                    ) : null}
                    <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                        <Logo className="size-5" />
                        <span>Bursora</span>
                    </div>
                </SidebarFooter>
            </Sidebar>
            <SidebarInset>
                <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
                    <SidebarTrigger className="md:hidden" />
                    {activeWorkspace ? (
                        <span className="truncate text-sm font-medium text-foreground">
                            {activeWorkspace.name}
                        </span>
                    ) : null}
                    <div className="flex-1" />
                    <div className="flex items-center gap-1">
                        <NotificationCenter />
                        <ThemeToggle />
                        <UserMenu
                            userId={session.user.id}
                            name={session.user.name}
                            email={session.user.email}
                            image={session.user.image}
                            showBilling={env().IS_CLOUD}
                            isAdmin={session.user.role === USER_ROLE.admin}
                        />
                    </div>
                </header>
                <main className="flex-1 p-6">{children}</main>
            </SidebarInset>
            <Suspense fallback={null}>
                <WorkspaceUrlSync />
            </Suspense>
            <ReactivatedToast />
            <KeyboardShortcuts workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />
        </SidebarProvider>
    );
}
