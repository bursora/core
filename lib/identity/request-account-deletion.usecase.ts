import type { ApiKeyRepository } from "./api-key.repository";
import {
    AccountDeletionBlockedError,
    planAccountDeletion,
    resolveBlockedWorkspaces,
} from "./delete-account.usecase";
import type { MemberRepository } from "./member.repository";
import type { UserRepository } from "./user.repository";
import type { WorkspaceRepository } from "./workspace.repository";

/** Grace window between a deletion request and the hard purge. */
export const ACCOUNT_DELETION_GRACE_MS = 24 * 60 * 60 * 1000;

export interface RequestAccountDeletionInput {
    readonly userId: string;
    readonly now: Date;
    readonly users: UserRepository;
    readonly members: MemberRepository;
    readonly workspaces: WorkspaceRepository;
    readonly keys: ApiKeyRepository;
    readonly graceMs?: number;
    /** Fired once the account is scheduled — send the goodbye email here. */
    readonly onScheduled?: (input: { userId: string; scheduledAt: Date }) => Promise<void>;
}

export interface RequestAccountDeletionResult {
    readonly scheduledAt: Date;
}

/**
 * Schedules a soft account deletion (start of the grace window).
 *
 * Blocks with `AccountDeletionBlockedError` when a sole-owned workspace still
 * has other members — ownership must move first. Otherwise it flags the
 * account `pending_deletion`, suspends the keys in the workspaces that will be
 * purged, signs the user out everywhere, and fires the goodbye-email hook. The
 * account-purge cron finishes the deletion once the window elapses; signing
 * back in before then reverts it.
 */
export async function requestAccountDeletionUseCase(
    input: RequestAccountDeletionInput,
): Promise<RequestAccountDeletionResult> {
    const plan = await planAccountDeletion(input.members, input.userId);
    if (plan.blockedWorkspaceIds.length > 0) {
        throw new AccountDeletionBlockedError(
            await resolveBlockedWorkspaces(input.workspaces, plan.blockedWorkspaceIds),
        );
    }

    const graceMs = input.graceMs ?? ACCOUNT_DELETION_GRACE_MS;
    const scheduledAt = new Date(input.now.getTime() + graceMs);

    await input.users.scheduleDeletion(input.userId, scheduledAt);
    await input.keys.suspendByWorkspaces(plan.purgeWorkspaceIds, input.now);
    await input.users.clearSessions(input.userId);
    await input.onScheduled?.({ userId: input.userId, scheduledAt });

    return { scheduledAt };
}
