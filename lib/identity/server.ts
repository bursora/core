/**
 * Identity wiring. Pages and route handlers call these bound use cases
 * instead of constructing repositories themselves.
 */

import { db } from "@/lib/db";
import { meteringDeps } from "@/lib/metering/server";
import * as Sentry from "@sentry/nextjs";
import { notFound } from "next/navigation";
import { cache } from "react";
import "server-only";
import { env } from "../env";
import { defaultSmtpMailer, sendAccountDeletionEmail } from "../notification";
import { acceptInviteUseCase } from "./accept-invite.usecase";
import { parseEncryptionKey } from "./api-key.cipher";
import { changeMemberRoleUseCase } from "./change-member-role.usecase";
import { createWorkspaceUseCase } from "./create-workspace.usecase";
import { deleteAccountUseCase } from "./delete-account.usecase";
import { DrizzleApiKeyAuditLogRepository } from "./drizzle-api-key-audit-log.repository";
import { DrizzleApiKeyRepository } from "./drizzle-api-key.repository";
import { DrizzleInviteRepository, DrizzleMemberRepository } from "./drizzle-member.repository";
import { DrizzleUserRepository } from "./drizzle-user.repository";
import { DrizzleWorkspaceRepository } from "./drizzle-workspace.repository";
import { inviteMemberUseCase } from "./invite-member.usecase";
import { issueApiKeyUseCase } from "./issue-api-key.usecase";
import { listApiKeysUseCase } from "./list-api-keys.usecase";
import { listMembersUseCase } from "./list-members.usecase";
import { lookupApiKeyUseCase } from "./lookup-api-key.usecase";
import type { MemberRole } from "./member";
import type { WorkspaceOwner } from "./member.repository";
import { reactivateAccountUseCase } from "./reactivate-account.usecase";
import { removeMemberUseCase } from "./remove-member.usecase";
import { renameApiKeyUseCase } from "./rename-api-key.usecase";
import { renameWorkspaceUseCase } from "./rename-workspace.usecase";
import { requestAccountDeletionUseCase } from "./request-account-deletion.usecase";
import { revealApiKeyUseCase, type RevealApiKeyResult } from "./reveal-api-key.usecase";
import { revokeApiKeyUseCase } from "./revoke-api-key.usecase";
import { setWorkspaceEnvironmentUseCase } from "./set-workspace-environment.usecase";
import { roleGrantsFreeAccess, USER_ROLE } from "./user-role";

const workspaces = () => new DrizzleWorkspaceRepository(db());
const members = () => new DrizzleMemberRepository(db());
const users = () => new DrizzleUserRepository(db());
const invites = () => new DrizzleInviteRepository(db());
const apiKeys = () => new DrizzleApiKeyRepository(db());
const apiKeyAudit = () => new DrizzleApiKeyAuditLogRepository(db());
const mailer = () => defaultSmtpMailer();

const inviteAcceptUrl = (token: string) => `${env().BETTER_AUTH_URL}/invite/${token}`;

// Decode the KEK once per request. `env()` already validated the length at
// boot, so this never throws here; the parse just turns base64 into a Buffer.
const encryptionKey = () => parseEncryptionKey(env().BURSORA_KEY);

export async function createWorkspace(input: {
    name: string;
    ownerId: string;
    environment?: string;
}) {
    return createWorkspaceUseCase({
        name: input.name,
        ownerId: input.ownerId,
        workspaces: workspaces(),
        members: members(),
        ...(input.environment ? { environment: input.environment } : {}),
    });
}

export async function getWorkspace(id: string) {
    return workspaces().findById(id);
}

export async function renameWorkspace(input: { id: string; name: string }) {
    return renameWorkspaceUseCase({
        id: input.id,
        name: input.name,
        workspaces: workspaces(),
    });
}

export async function setWorkspaceEnvironment(input: { id: string; environment: string }) {
    return setWorkspaceEnvironmentUseCase({
        id: input.id,
        environment: input.environment,
        workspaces: workspaces(),
    });
}

export async function deleteWorkspace(id: string) {
    await workspaces().delete(id);
}

export async function inviteMember(input: {
    workspaceId: string;
    email: string;
    invitedBy: string;
    role?: MemberRole;
}) {
    return inviteMemberUseCase({
        workspaceId: input.workspaceId,
        email: input.email,
        invitedBy: input.invitedBy,
        role: input.role ?? "member",
        invites: invites(),
        mailer: mailer(),
        acceptUrl: inviteAcceptUrl,
    });
}

/**
 * Per-request memoised member roster. The dashboard home renders both the
 * getting-started widget and the capacity row, which each read the roster —
 * cache so the DB sees one query per request.
 */
export const listWorkspaceMembers = cache(async (workspaceId: string) =>
    listMembersUseCase({ workspaceId, members: members() }),
);

export async function listPendingInvites(workspaceId: string) {
    return invites().listPendingByWorkspace(workspaceId);
}

export async function cancelPendingInvite(input: { workspaceId: string; email: string }) {
    return invites().deletePending(input);
}

export async function removeWorkspaceMember(input: { workspaceId: string; userId: string }) {
    return removeMemberUseCase({
        workspaceId: input.workspaceId,
        userId: input.userId,
        members: members(),
    });
}

export async function changeWorkspaceMemberRole(input: {
    workspaceId: string;
    userId: string;
    role: MemberRole;
}) {
    return changeMemberRoleUseCase({
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: input.role,
        members: members(),
    });
}

/**
 * Schedules a soft account deletion (start of the 24h grace window): flags the
 * account, suspends its keys, signs the user out, and emails a goodbye with a
 * sign-back-in link. Throws `AccountDeletionBlockedError` when a sole-owned
 * workspace still has other members — the caller must transfer ownership first.
 */
export async function requestAccountDeletion(input: { userId: string; email: string }) {
    return requestAccountDeletionUseCase({
        userId: input.userId,
        now: new Date(),
        users: users(),
        members: members(),
        workspaces: workspaces(),
        keys: apiKeys(),
        onScheduled: async () => {
            // The account is already scheduled, suspended, and signed out by
            // now, so a flaky mailer must not surface as a failed deletion.
            try {
                await sendAccountDeletionEmail({
                    mailer: mailer(),
                    email: input.email,
                    signInUrl: `${env().BETTER_AUTH_URL}/login`,
                });
            } catch (err: unknown) {
                Sentry.captureException(err, {
                    tags: { area: "account-deletion", step: "goodbye-email" },
                    extra: { userId: input.userId },
                });
            }
        },
    });
}

/**
 * Reverts a pending account deletion when the user signs back in during the
 * grace window. No-op for active accounts. Wired into the better-auth sign-in
 * hook (see lib/auth.ts).
 */
export async function reactivateAccount(input: { userId: string }): Promise<boolean> {
    return reactivateAccountUseCase({
        userId: input.userId,
        users: users(),
        members: members(),
        keys: apiKeys(),
    });
}

/**
 * Hard-purges every account whose grace window has elapsed. Run by the
 * account-purge cron. Per-account failures are logged and skipped so one bad
 * record can't stall the batch. Erases the deleted workspaces' ClickHouse
 * usage events as part of each purge.
 */
export async function runAccountPurgeCron(now: Date): Promise<{ purged: number; failed: number }> {
    const due = await users().listDueForPurge(now);

    // EE, cloud-only: cancel each purged account's Lemon Squeezy subscription
    // before its row is erased, so a paid sub is not left billing upstream.
    // Dynamic import + OSS_BUILD guard keep EE out of the OSS bundle (same
    // pattern as the cron scheduler); self-host has no provider, so the hook
    // stays undefined and the delete proceeds without it.
    let onBeforeUserDelete: ((userId: string) => Promise<void>) | undefined;
    if (process.env.OSS_BUILD !== "true" && env().IS_CLOUD) {
        const { cancelSubscriptionOnAccountDeletion } = await import("@/lib/ee/billing/server");
        onBeforeUserDelete = cancelSubscriptionOnAccountDeletion;
    }

    let purged = 0;
    let failed = 0;
    for (const userId of due) {
        try {
            await deleteAccountUseCase({
                userId,
                users: users(),
                members: members(),
                workspaces: workspaces(),
                onWorkspacesDeleted: (workspaceIds) =>
                    meteringDeps().eventsRepo.eraseByWorkspaces(workspaceIds),
                ...(onBeforeUserDelete ? { onBeforeUserDelete } : {}),
            });
            purged += 1;
        } catch (err: unknown) {
            // Skip this account so one bad record can't stall the batch, but
            // report it — a stuck purge is a GDPR-retention problem we must see.
            Sentry.captureException(err, {
                tags: { area: "account-deletion", step: "purge" },
                extra: { userId },
            });
            failed += 1;
        }
    }
    return { purged, failed };
}

/**
 * The user's global platform role (`admin` | `beta` | `user`), or null when the
 * user is unknown. Read on the onboarding entry to let a beta account skip the
 * pay-step. A plain identity read — never touches billing/EE.
 */
export async function getUserRole(userId: string) {
    return users().getRole(userId);
}

export async function acceptInvite(input: { token: string; userId: string; email: string }) {
    return acceptInviteUseCase({
        token: input.token,
        userId: input.userId,
        email: input.email,
        invites: invites(),
        members: members(),
    });
}

export async function issueApiKey(input: {
    workspaceId: string;
    name: string;
    userId?: string | null;
    ip?: string | null;
}) {
    return issueApiKeyUseCase({
        workspaceId: input.workspaceId,
        name: input.name,
        pepper: env().BURSORA_API_KEY_PEPPER,
        encryptionKey: encryptionKey(),
        keys: apiKeys(),
        audit: apiKeyAudit(),
        userId: input.userId ?? null,
        ip: input.ip ?? null,
    });
}

/**
 * Reveal a key's plaintext for a workspace member. Scoped to the passed
 * workspace id (which the action layer derives from the session, never the
 * request body) and audited on success.
 */
export async function revealApiKey(input: {
    id: string;
    workspaceId: string;
    userId?: string | null;
    ip?: string | null;
}): Promise<RevealApiKeyResult> {
    return revealApiKeyUseCase({
        id: input.id,
        workspaceId: input.workspaceId,
        encryptionKey: encryptionKey(),
        keys: apiKeys(),
        audit: apiKeyAudit(),
        userId: input.userId ?? null,
        ip: input.ip ?? null,
    });
}

/**
 * Per-request memoised key list. The dashboard home's getting-started widget
 * and capacity row both read it on the same render — cache to dedupe.
 */
export const listApiKeys = cache(async (workspaceId: string) =>
    listApiKeysUseCase({ workspaceId, keys: apiKeys() }),
);

export async function revokeApiKey(input: {
    id: string;
    workspaceId: string;
    userId?: string | null;
    ip?: string | null;
}) {
    return revokeApiKeyUseCase({
        id: input.id,
        workspaceId: input.workspaceId,
        keys: apiKeys(),
        audit: apiKeyAudit(),
        userId: input.userId ?? null,
        ip: input.ip ?? null,
    });
}

export async function renameApiKey(input: {
    id: string;
    workspaceId: string;
    name: string;
    userId?: string | null;
    ip?: string | null;
}) {
    return renameApiKeyUseCase({
        id: input.id,
        workspaceId: input.workspaceId,
        name: input.name,
        keys: apiKeys(),
        audit: apiKeyAudit(),
        userId: input.userId ?? null,
        ip: input.ip ?? null,
    });
}

export async function lookupApiKey(plaintext: string) {
    return lookupApiKeyUseCase({
        plaintext,
        pepper: env().BURSORA_API_KEY_PEPPER,
        keys: apiKeys(),
    });
}

/**
 * Per-request memoised membership lookup. Layout + page typically both call
 * `assertWorkspaceMember*` for the same (workspace, user) tuple — cache so
 * the DB only sees one query.
 */
export const findMembership = cache(async (workspaceId: string, userId: string) =>
    members().findMembership(workspaceId, userId),
);

/**
 * The single deterministic workspace owner: id + platform role from one query,
 * memoised per request. Every owner-derived read on the hot `/api/v1/budget`
 * preflight routes through here — the admin-owned bypass reads the role, the
 * cloud billing gate reads the id — so the preflight resolves the owner once.
 */
export const getWorkspaceOwner = cache(
    async (workspaceId: string): Promise<WorkspaceOwner | null> => members().findOwner(workspaceId),
);

/**
 * The user id of the workspace's owner — the single member whose Bursora Cloud
 * subscription gates the workspace (see the billing gate). Used to decide
 * whether the viewer is the one who can unlock it by subscribing.
 */
export async function getWorkspaceOwnerUserId(workspaceId: string): Promise<string | null> {
    return (await getWorkspaceOwner(workspaceId))?.userId ?? null;
}

/**
 * True when the workspace owner is a platform admin. Drives the rate-limit
 * and fair-use exemptions for the operator's own dogfood tenants. Derives from
 * the shared per-request owner cache, so the SDK ingest path that resolves this
 * on every event still issues a single owner query.
 */
export async function isAdminOwnedWorkspace(workspaceId: string): Promise<boolean> {
    return (await getWorkspaceOwner(workspaceId))?.role === USER_ROLE.admin;
}

/**
 * True when the workspace owner is a beta account. Drives ONLY the cloud
 * view-paywall bypass — a beta-owned workspace renders real data without a
 * subscription. Deliberately separate from `isAdminOwnedWorkspace`: beta keeps
 * budget enforcement, rate limits, and the fair-use cap fully live, so it must
 * not feed those bypasses. Reads from the shared per-request owner cache.
 */
export async function isBetaOwnedWorkspace(workspaceId: string): Promise<boolean> {
    return roleGrantsFreeAccess((await getWorkspaceOwner(workspaceId))?.role);
}

/**
 * Asserts the authenticated user is a member of the given workspace and
 * returns their membership. Throws on failure — use in API/route handlers
 * that map errors to 4xx responses.
 */
export async function assertWorkspaceMember(input: { workspaceId: string; userId: string }) {
    const membership = await findMembership(input.workspaceId, input.userId);
    if (!membership) {
        throw new Error("not a member of this workspace");
    }
    return membership;
}

/**
 * UI variant of `assertWorkspaceMember`. Calls `notFound()` on non-membership
 * so URL fiddling lands on a clean 404 page instead of a Next 500.
 */
export async function assertWorkspaceMemberOrNotFound(input: {
    workspaceId: string;
    userId: string;
}) {
    const membership = await findMembership(input.workspaceId, input.userId);
    if (!membership) notFound();
    return membership;
}

export async function assertWorkspaceOwner(input: { workspaceId: string; userId: string }) {
    const membership = await findMembership(input.workspaceId, input.userId);
    if (!membership || membership.role !== "owner") {
        throw new Error("owner role required");
    }
    return membership;
}
