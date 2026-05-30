/**
 * Resolves whether a workspace is run by a platform admin — its owner's
 * `users.role` is `admin`. Admin-owned workspaces are the operator's own
 * dogfood tenants; they skip the per-API-key rate limit and the fair-use
 * event cap so internal usage never throttles or banners.
 *
 * Returns `false` for a regular owner and for a workspace with no owner row.
 */

import type { MemberRepository } from "./member.repository";
import { USER_ROLE } from "./user-role";

export interface IsAdminOwnedWorkspaceInput {
    readonly workspaceId: string;
    readonly members: MemberRepository;
}

export async function isAdminOwnedWorkspaceUseCase(
    input: IsAdminOwnedWorkspaceInput,
): Promise<boolean> {
    const ownerRole = await input.members.findOwnerUserRole(input.workspaceId);
    return ownerRole === USER_ROLE.admin;
}
