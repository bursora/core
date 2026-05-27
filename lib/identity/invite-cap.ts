/**
 * Pending-invite cap.
 *
 * Owners can otherwise spam unlimited invites; that risks email delivery
 * DoS and unbounded row growth. The cap counts rows where
 * `accepted_at IS NULL`; accepted invites do not count against the workspace.
 */

export const MAX_PENDING_INVITES_PER_WORKSPACE = 1000;

export class InviteCapExceededError extends Error {
    readonly code = "invite_cap_exceeded" as const;
    readonly workspaceId: string;
    readonly limit: number;

    constructor(workspaceId: string, limit: number) {
        super(
            `workspace ${workspaceId} has reached the pending-invite cap of ${limit}; accept or revoke an existing invite before sending another`,
        );
        this.name = "InviteCapExceededError";
        this.workspaceId = workspaceId;
        this.limit = limit;
    }
}
