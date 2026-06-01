/**
 * Onboarding wiring. Resolves a workspace's activation state by reusing the
 * existing identity / metering / budgeting read paths plus the dismiss cookie,
 * then deriving the booleans with the pure `deriveActivationState`.
 *
 * Pages call this; they never count keys/events/budgets/members themselves.
 */

import { listBudgets } from "@/lib/budgeting/server";
import { listApiKeys, listPendingInvites, listWorkspaceMembers } from "@/lib/identity/server";
import { countEventsForWorkspace } from "@/lib/metering/server";
import "server-only";
import { deriveActivationState, type ActivationState } from "./activation-state";
import { isOnboardingDismissed } from "./dismiss-cookie";

export async function resolveActivationState(workspaceId: string): Promise<ActivationState> {
    // Dismissed is the common returning-user case and hides the widget on its
    // own. Read it first and bail before firing the four activation queries.
    if (await isOnboardingDismissed(workspaceId)) {
        return deriveActivationState({
            apiKeys: [],
            eventCount: 0,
            budgetCount: 0,
            memberCount: 0,
            pendingInviteCount: 0,
            dismissed: true,
        });
    }

    const [apiKeys, eventCount, budgets, members, pendingInvites] = await Promise.all([
        listApiKeys(workspaceId),
        countEventsForWorkspace({ workspaceId }),
        listBudgets(workspaceId),
        listWorkspaceMembers(workspaceId),
        listPendingInvites(workspaceId),
    ]);

    return deriveActivationState({
        apiKeys,
        eventCount,
        budgetCount: budgets.length,
        memberCount: members.length,
        pendingInviteCount: pendingInvites.length,
        dismissed: false,
    });
}
