import type { MemberRepository } from "./member.repository";
import type { UserRepository } from "./user.repository";
import type { WorkspaceRepository } from "./workspace.repository";

export interface BlockedWorkspace {
    readonly id: string;
    readonly name: string;
}

/**
 * Thrown when account deletion would orphan a workspace: the user is its sole
 * owner but other members remain. The caller must transfer ownership (or remove
 * the other members) before the account can be deleted. Carries the offending
 * workspaces so the UI can name them.
 */
export class AccountDeletionBlockedError extends Error {
    constructor(readonly workspaces: readonly BlockedWorkspace[]) {
        super("transfer ownership of these workspaces before deleting your account");
        this.name = "AccountDeletionBlockedError";
    }
}

export interface AccountDeletionPlan {
    /** Workspaces the user solely owns but that still have other members. */
    readonly blockedWorkspaceIds: readonly string[];
    /** Sole-member workspaces to delete outright when the account is purged. */
    readonly purgeWorkspaceIds: readonly string[];
}

/**
 * Resolves what deleting this user's account would do to their workspaces.
 *
 * A user-row delete cascades away memberships but leaves the workspaces — so a
 * workspace the user solely owns would survive ownerless, with live API keys
 * and billing. Per owned workspace:
 *
 * - co-owned (another owner remains) → cascade-safe, ignored
 * - sole owner, no other members → purge it
 * - sole owner, other members remain → blocked; ownership must move first
 *
 * Uses only the member repository, so request, reactivation, and purge all
 * share one definition of the workspace set.
 */
export async function planAccountDeletion(
    members: MemberRepository,
    userId: string,
): Promise<AccountDeletionPlan> {
    const workspaceIds = await members.listWorkspaceIdsForUser(userId);

    const blockedWorkspaceIds: string[] = [];
    const purgeWorkspaceIds: string[] = [];

    for (const workspaceId of workspaceIds) {
        const membership = await members.findMembership(workspaceId, userId);
        if (!membership || membership.role !== "owner") continue;

        const owners = await members.countOwners(workspaceId);
        if (owners >= 2) continue;

        const memberCount = (await members.listMemberUserIds(workspaceId)).length;
        if (memberCount >= 2) blockedWorkspaceIds.push(workspaceId);
        else purgeWorkspaceIds.push(workspaceId);
    }

    return { blockedWorkspaceIds, purgeWorkspaceIds };
}

/** Resolves blocked workspace ids to {id, name} for a user-facing error. */
export async function resolveBlockedWorkspaces(
    workspaces: WorkspaceRepository,
    ids: readonly string[],
): Promise<BlockedWorkspace[]> {
    const resolved: BlockedWorkspace[] = [];
    for (const id of ids) {
        const workspace = await workspaces.findById(id);
        resolved.push({ id, name: workspace?.name ?? id });
    }
    return resolved;
}

export interface DeleteAccountInput {
    readonly userId: string;
    readonly users: UserRepository;
    readonly members: MemberRepository;
    readonly workspaces: WorkspaceRepository;
    /**
     * Erases each purged workspace's external data (ClickHouse usage events).
     * Runs as part of the purge but before the Postgres workspace rows are
     * removed, so a failure here is retriable on the next run.
     */
    readonly onWorkspacesDeleted?: (workspaceIds: readonly string[]) => Promise<void>;
    /**
     * Runs just before the user row is deleted. Wire subscription cancellation
     * here, while the subscription row still exists.
     */
    readonly onBeforeUserDelete?: (userId: string) => Promise<void>;
}

/**
 * Hard-deletes a user's account (GDPR erasure). This is the purge step the
 * account-purge cron runs once the grace window elapses. Throws
 * `AccountDeletionBlockedError` if a sole-owned workspace still has members —
 * the request step prevents this, so at purge time it only guards against an
 * ownership change during the window.
 */
export async function deleteAccountUseCase(input: DeleteAccountInput): Promise<void> {
    const plan = await planAccountDeletion(input.members, input.userId);

    if (plan.blockedWorkspaceIds.length > 0) {
        throw new AccountDeletionBlockedError(
            await resolveBlockedWorkspaces(input.workspaces, plan.blockedWorkspaceIds),
        );
    }

    if (plan.purgeWorkspaceIds.length > 0) {
        // Erase external data (ClickHouse usage events) before the Postgres
        // delete. The erase is idempotent; deleting Postgres first would drop
        // the membership rows the plan derives from, so a failed erase could
        // never be retried — orphaning the usage events.
        await input.onWorkspacesDeleted?.(plan.purgeWorkspaceIds);
        for (const workspaceId of plan.purgeWorkspaceIds) {
            await input.workspaces.delete(workspaceId);
        }
    }

    await input.onBeforeUserDelete?.(input.userId);
    await input.users.delete(input.userId);
}
