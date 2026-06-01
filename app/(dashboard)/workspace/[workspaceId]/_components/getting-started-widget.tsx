/**
 * "Getting started" widget. Resolves the active workspace's activation state
 * and renders the compact five-step card while onboarding is incomplete and not
 * dismissed; otherwise renders nothing. Mounted under Suspense in the sidebar
 * footer so the card slots in once the resolver settles.
 */

import { buildGettingStartedRows } from "@/lib/onboarding/getting-started-rows";
import { resolveActivationState } from "@/lib/onboarding/server";
import { dismissGettingStartedAction } from "./getting-started-actions";
import { GettingStartedCard } from "./getting-started-card";

interface GettingStartedWidgetProps {
    readonly workspaceId: string;
}

export async function GettingStartedWidget({ workspaceId }: GettingStartedWidgetProps) {
    const state = await resolveActivationState(workspaceId);
    const { rows, completed, total } = buildGettingStartedRows(state, workspaceId);

    if (state.dismissed || completed >= total) return null;

    return (
        <GettingStartedCard
            workspaceId={workspaceId}
            rows={rows}
            completed={completed}
            total={total}
            dismissAction={dismissGettingStartedAction}
        />
    );
}
