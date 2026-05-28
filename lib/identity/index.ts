/**
 * Public API of the identity feature.
 *
 * Types and use cases live here. Bound (composition-root) functions live in
 * `./server` — import them from `./identity/server`.
 */

export {
    acceptInviteUseCase,
    type AcceptInviteInput,
    type AcceptInviteResult,
} from "./accept-invite.usecase";
export {
    API_KEY_PREFIX,
    API_KEY_RANDOM_LENGTH,
    type ApiKey,
    type ApiKeyLookup,
    type IssuedApiKey,
} from "./api-key";
export {
    createWorkspaceUseCase,
    type CreateWorkspaceInput,
    type CreateWorkspaceResult,
} from "./create-workspace.usecase";
export { InviteCapExceededError, MAX_PENDING_INVITES_PER_WORKSPACE } from "./invite-cap";
export { inviteMemberUseCase, type InviteMemberInput } from "./invite-member.usecase";
export { issueApiKeyUseCase, type IssueApiKeyInput } from "./issue-api-key.usecase";
export {
    listApiKeysUseCase,
    type ApiKeyListItem,
    type ListApiKeysInput,
} from "./list-api-keys.usecase";
export { listMembersUseCase } from "./list-members.usecase";
export { lookupApiKeyUseCase } from "./lookup-api-key.usecase";
export { renameApiKeyUseCase, type RenameApiKeyInput } from "./rename-api-key.usecase";
export { renameWorkspaceUseCase, type RenameWorkspaceInput } from "./rename-workspace.usecase";
export { resendInviteUseCase, type ResendInviteInput } from "./resend-invite.usecase";
export { revokeApiKeyUseCase, type RevokeApiKeyInput } from "./revoke-api-key.usecase";
export {
    setWorkspaceEnvironmentUseCase,
    type SetWorkspaceEnvironmentInput,
} from "./set-workspace-environment.usecase";

export type { ApiKeyRepository } from "./api-key.repository";
export type {
    ApiKeyAuditAction,
    ApiKeyAuditLogEntry,
    ApiKeyAuditLogRepository,
    RecordApiKeyAuditLogInput,
} from "./api-key-audit-log.repository";

export { generateApiKeyPlaintext, hashApiKey, parseApiKeyPlaintext } from "./api-key.crypto";

export type { Invite, MemberRole, WorkspaceMember } from "./member";
export type { InviteRepository, MemberListRow, MemberRepository } from "./member.repository";

export type { Workspace } from "./workspace";
export type { WorkspaceCreateInput, WorkspaceRepository } from "./workspace.repository";

export {
    revokeBadgeLabel,
    revokeReducer,
    type RevokeAction,
    type RevokeState,
} from "./optimistic-revoke";
