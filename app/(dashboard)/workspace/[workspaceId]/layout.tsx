import { AppShell } from "@/components/shell/app-shell";
import { requireSessionUI } from "@/lib/auth";
import { cloudWorkspaceLocked } from "@/lib/billing-gate/server";
import { assertWorkspaceMemberOrNotFound } from "@/lib/identity/server";
import { Suspense, type ReactNode } from "react";
import { EventBundleBanner } from "./_components/event-bundle-banner";
import { RateLimitBanner } from "./_components/rate-limit-banner";
import { WorkspaceBannerNotifications } from "./_components/workspace-banner-notifications";

interface LayoutProps {
    children: ReactNode;
    params: Promise<{ workspaceId: string }>;
}

/**
 * Parent-layout guard for every `/workspace/[workspaceId]/...` route.
 *
 * This is the security boundary for workspace membership: any request that
 * reaches a nested page or RSC has already passed this check. Nested pages
 * may still call `assertWorkspaceMemberOrNotFound` when they need the
 * membership row (e.g. role checks) — the underlying lookup is request-
 * cached so it's effectively free.
 */
export default async function WorkspaceLayout({ children, params }: LayoutProps) {
    const { workspaceId } = await params;
    const session = await requireSessionUI();
    await assertWorkspaceMemberOrNotFound({
        workspaceId,
        userId: session.user.id,
    });
    // A locked cloud workspace sees only the paywall. Suppress the data banners
    // (event-bundle usage counts, rate-limit/spike rates, alert notifications) so
    // no real workspace data reaches a locked client. Self-host is never locked,
    // so this short-circuits with no billing read there.
    const locked = await cloudWorkspaceLocked(workspaceId);
    return (
        <AppShell urlWorkspaceId={workspaceId}>
            {locked ? null : (
                <>
                    <Suspense fallback={null}>
                        <WorkspaceBannerNotifications
                            workspaceId={workspaceId}
                            userId={session.user.id}
                        />
                    </Suspense>
                    <Suspense fallback={null}>
                        <RateLimitBanner workspaceId={workspaceId} />
                    </Suspense>
                    <Suspense fallback={null}>
                        <EventBundleBanner workspaceId={workspaceId} />
                    </Suspense>
                </>
            )}
            {children}
        </AppShell>
    );
}
