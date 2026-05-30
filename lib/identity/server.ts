/**
 * Identity wiring. Pages and route handlers call these bound use cases
 * instead of constructing repositories themselves.
 */

import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { cache } from "react";
import "server-only";
import { env } from "../env";
import { defaultSmtpMailer } from "../notification";
import { acceptInviteUseCase } from "./accept-invite.usecase";
import { createWorkspaceUseCase } from "./create-workspace.usecase";
import { DrizzleApiKeyAuditLogRepository } from "./drizzle-api-key-audit-log.repository";
import { DrizzleApiKeyRepository } from "./drizzle-api-key.repository";
import { DrizzleInviteRepository, DrizzleMemberRepository } from "./drizzle-member.repository";
import { DrizzleWorkspaceRepository } from "./drizzle-workspace.repository";
import { inviteMemberUseCase } from "./invite-member.usecase";
import { isAdminOwnedWorkspaceUseCase } from "./is-admin-owned-workspace.usecase";
import { issueApiKeyUseCase } from "./issue-api-key.usecase";
import { listApiKeysUseCase } from "./list-api-keys.usecase";
import { listMembersUseCase } from "./list-members.usecase";
import { lookupApiKeyUseCase } from "./lookup-api-key.usecase";
import type { MemberRole } from "./member";
import { renameApiKeyUseCase } from "./rename-api-key.usecase";
import { renameWorkspaceUseCase } from "./rename-workspace.usecase";
import { revokeApiKeyUseCase } from "./revoke-api-key.usecase";
import { setWorkspaceEnvironmentUseCase } from "./set-workspace-environment.usecase";

const workspaces = () => new DrizzleWorkspaceRepository(db());
const members = () => new DrizzleMemberRepository(db());
const invites = () => new DrizzleInviteRepository(db());
const apiKeys = () => new DrizzleApiKeyRepository(db());
const apiKeyAudit = () => new DrizzleApiKeyAuditLogRepository(db());
const mailer = () => defaultSmtpMailer();

const inviteAcceptUrl = (token: string) => `${env().BETTER_AUTH_URL}/invite/${token}`;

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

export async function listWorkspaceMembers(workspaceId: string) {
    return listMembersUseCase({ workspaceId, members: members() });
}

export async function listPendingInvites(workspaceId: string) {
    return invites().listPendingByWorkspace(workspaceId);
}

export async function cancelPendingInvite(input: { workspaceId: string; email: string }) {
    return invites().deletePending(input);
}

export async function acceptInvite(input: { token: string; userId: string }) {
    return acceptInviteUseCase({
        token: input.token,
        userId: input.userId,
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
        keys: apiKeys(),
        audit: apiKeyAudit(),
        userId: input.userId ?? null,
        ip: input.ip ?? null,
    });
}

export async function listApiKeys(workspaceId: string) {
    return listApiKeysUseCase({ workspaceId, keys: apiKeys() });
}

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
 * True when the workspace owner is a platform admin. Drives the rate-limit
 * and fair-use exemptions for the operator's own dogfood tenants.
 *
 * Memoised per request: the SDK ingest path resolves this on every event, so
 * cache the owner-role read to keep it a single query within a request.
 */
export const isAdminOwnedWorkspace = cache(async (workspaceId: string): Promise<boolean> =>
    isAdminOwnedWorkspaceUseCase({ workspaceId, members: members() }),
);

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
