import type { ApiKeyRepository } from "./api-key.repository";
import { planAccountDeletion } from "./delete-account.usecase";
import type { MemberRepository } from "./member.repository";
import { USER_STATUS } from "./user-status";
import type { UserRepository } from "./user.repository";

export interface ReactivateAccountInput {
    readonly userId: string;
    readonly users: UserRepository;
    readonly members: MemberRepository;
    readonly keys: ApiKeyRepository;
}

/**
 * Reverts a pending account deletion — the user signed back in during the
 * grace window. Un-suspends the keys in the workspaces that were slated for
 * purge and clears the deletion flag. No-op (returns false) for an account
 * that is not pending deletion.
 */
export async function reactivateAccountUseCase(input: ReactivateAccountInput): Promise<boolean> {
    const status = await input.users.getStatus(input.userId);
    if (status !== USER_STATUS.pendingDeletion) return false;

    const plan = await planAccountDeletion(input.members, input.userId);
    await input.keys.unsuspendByWorkspaces(plan.purgeWorkspaceIds);
    await input.users.cancelDeletion(input.userId);
    return true;
}
