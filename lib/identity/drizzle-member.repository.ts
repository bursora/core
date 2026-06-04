import "server-only";

import type { Db } from "@/lib/db";
import { requireInsertedRow, schema } from "@/lib/db";
import { and, asc, count, desc, eq, gt, isNull } from "drizzle-orm";
import type { Invite, MemberRole, WorkspaceMember } from "./member";
import type { InviteRepository, MemberListRow, MemberRepository } from "./member.repository";
import { USER_ROLE, type UserRole } from "./user-role";
import { USER_STATUS, type UserStatus } from "./user-status";

export class DrizzleMemberRepository implements MemberRepository {
    constructor(private readonly db: Db) {}

    async addMember(input: {
        workspaceId: string;
        userId: string;
        role: MemberRole;
    }): Promise<WorkspaceMember> {
        const [row] = await this.db
            .insert(schema.workspaceMembers)
            .values({
                workspaceId: input.workspaceId,
                userId: input.userId,
                role: input.role,
            })
            .returning();
        return toMember(requireInsertedRow(row, "member"));
    }

    async findMembership(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
        const [row] = await this.db
            .select()
            .from(schema.workspaceMembers)
            .where(
                and(
                    eq(schema.workspaceMembers.workspaceId, workspaceId),
                    eq(schema.workspaceMembers.userId, userId),
                ),
            )
            .limit(1);
        return row ? toMember(row) : null;
    }

    async removeMember(workspaceId: string, userId: string): Promise<void> {
        await this.db
            .delete(schema.workspaceMembers)
            .where(
                and(
                    eq(schema.workspaceMembers.workspaceId, workspaceId),
                    eq(schema.workspaceMembers.userId, userId),
                ),
            );
    }

    async updateRole(workspaceId: string, userId: string, role: MemberRole): Promise<void> {
        await this.db
            .update(schema.workspaceMembers)
            .set({ role })
            .where(
                and(
                    eq(schema.workspaceMembers.workspaceId, workspaceId),
                    eq(schema.workspaceMembers.userId, userId),
                ),
            );
    }

    async countOwners(workspaceId: string): Promise<number> {
        const [row] = await this.db
            .select({ count: count() })
            .from(schema.workspaceMembers)
            .where(
                and(
                    eq(schema.workspaceMembers.workspaceId, workspaceId),
                    eq(schema.workspaceMembers.role, "owner"),
                ),
            );
        return row?.count ?? 0;
    }

    async listWorkspaceIdsForUser(userId: string): Promise<readonly string[]> {
        const rows = await this.db
            .select({ workspaceId: schema.workspaceMembers.workspaceId })
            .from(schema.workspaceMembers)
            .where(eq(schema.workspaceMembers.userId, userId));
        return rows.map((r) => r.workspaceId);
    }

    async listByWorkspace(workspaceId: string): Promise<readonly MemberListRow[]> {
        const rows = await this.db
            .select({
                workspaceId: schema.workspaceMembers.workspaceId,
                userId: schema.workspaceMembers.userId,
                email: schema.users.email,
                image: schema.users.image,
                role: schema.workspaceMembers.role,
                status: schema.users.status,
                createdAt: schema.workspaceMembers.createdAt,
            })
            .from(schema.workspaceMembers)
            .innerJoin(schema.users, eq(schema.workspaceMembers.userId, schema.users.id))
            .where(eq(schema.workspaceMembers.workspaceId, workspaceId))
            .orderBy(desc(schema.workspaceMembers.createdAt));

        return rows.map((row) => ({
            workspaceId: row.workspaceId,
            userId: row.userId,
            email: row.email,
            image: row.image,
            role: toMemberRole(row.role),
            status: toUserStatus(row.status),
            createdAt: row.createdAt,
        }));
    }

    async listMemberUserIds(workspaceId: string): Promise<readonly string[]> {
        const rows = await this.db
            .select({ userId: schema.workspaceMembers.userId })
            .from(schema.workspaceMembers)
            .where(eq(schema.workspaceMembers.workspaceId, workspaceId));
        return rows.map((r) => r.userId);
    }

    async findOwnerUserRole(workspaceId: string): Promise<UserRole | null> {
        // A workspace may have multiple owners. It counts as admin-owned when
        // any owner is a platform admin, so sort an admin owner first; fall back
        // to a stable order (oldest, then id) so the resolved role never flips
        // between calls when no admin owner exists.
        const [row] = await this.db
            .select({ role: schema.users.role })
            .from(schema.workspaceMembers)
            .innerJoin(schema.users, eq(schema.workspaceMembers.userId, schema.users.id))
            .where(
                and(
                    eq(schema.workspaceMembers.workspaceId, workspaceId),
                    eq(schema.workspaceMembers.role, "owner"),
                ),
            )
            .orderBy(
                desc(eq(schema.users.role, USER_ROLE.admin)),
                asc(schema.workspaceMembers.createdAt),
                asc(schema.workspaceMembers.userId),
            )
            .limit(1);
        // `users.role` is a text column, so narrow it to the platform-role union
        // at this boundary: the column only ever holds admin|user (default +
        // input:false), and the sole caller checks admin-vs-rest.
        if (!row) return null;
        return row.role === USER_ROLE.admin ? USER_ROLE.admin : USER_ROLE.user;
    }

    async findOwnerUserId(workspaceId: string): Promise<string | null> {
        // Same single-owner resolution as `findOwnerUserRole`: admin owner
        // first, then oldest, then id, so the resolved owner never flips
        // between calls.
        const [row] = await this.db
            .select({ userId: schema.workspaceMembers.userId })
            .from(schema.workspaceMembers)
            .innerJoin(schema.users, eq(schema.workspaceMembers.userId, schema.users.id))
            .where(
                and(
                    eq(schema.workspaceMembers.workspaceId, workspaceId),
                    eq(schema.workspaceMembers.role, "owner"),
                ),
            )
            .orderBy(
                desc(eq(schema.users.role, USER_ROLE.admin)),
                asc(schema.workspaceMembers.createdAt),
                asc(schema.workspaceMembers.userId),
            )
            .limit(1);
        return row?.userId ?? null;
    }
}

type MemberRow = typeof schema.workspaceMembers.$inferSelect;

// `role` is a text column; narrow it to the member-role union at the boundary.
function toMemberRole(raw: string): MemberRole {
    return raw === "owner" ? "owner" : "member";
}

// `users.status` is a text column; narrow it to the status union at the boundary.
function toUserStatus(raw: string): UserStatus {
    return raw === USER_STATUS.pendingDeletion ? USER_STATUS.pendingDeletion : USER_STATUS.active;
}

function toMember(row: MemberRow): WorkspaceMember {
    return {
        workspaceId: row.workspaceId,
        userId: row.userId,
        role: toMemberRole(row.role),
        createdAt: row.createdAt,
    };
}

export class DrizzleInviteRepository implements InviteRepository {
    constructor(private readonly db: Db) {}

    async create(input: {
        token: string;
        workspaceId: string;
        email: string;
        invitedBy: string;
        role: MemberRole;
        expiresAt: Date;
    }): Promise<Invite> {
        const [row] = await this.db
            .insert(schema.workspaceInvites)
            .values({
                token: input.token,
                workspaceId: input.workspaceId,
                email: input.email,
                invitedBy: input.invitedBy,
                role: input.role,
                expiresAt: input.expiresAt,
            })
            .returning();
        return toInvite(requireInsertedRow(row, "invite"));
    }

    async findByToken(token: string): Promise<Invite | null> {
        const [row] = await this.db
            .select()
            .from(schema.workspaceInvites)
            .where(eq(schema.workspaceInvites.token, token))
            .limit(1);
        return row ? toInvite(row) : null;
    }

    async claim(token: string, acceptedAt: Date): Promise<Invite | null> {
        // Atomic compare-and-swap. The WHERE acceptedAt IS NULL clause is
        // evaluated inside the UPDATE, so concurrent transactions race on
        // the row-level lock; only one observes the row as unclaimed.
        //
        // The `expires_at > acceptedAt` predicate folds the expiry check into
        // the same UPDATE. Without it, an invite could pass the pre-check in
        // `acceptInviteUseCase` and then claim seconds after the deadline.
        const [row] = await this.db
            .update(schema.workspaceInvites)
            .set({ acceptedAt })
            .where(
                and(
                    eq(schema.workspaceInvites.token, token),
                    isNull(schema.workspaceInvites.acceptedAt),
                    gt(schema.workspaceInvites.expiresAt, acceptedAt),
                ),
            )
            .returning();
        return row ? toInvite(row) : null;
    }

    async deletePending(input: { workspaceId: string; email: string }): Promise<number> {
        const rows = await this.db
            .delete(schema.workspaceInvites)
            .where(
                and(
                    eq(schema.workspaceInvites.workspaceId, input.workspaceId),
                    eq(schema.workspaceInvites.email, input.email),
                    isNull(schema.workspaceInvites.acceptedAt),
                ),
            )
            .returning({ token: schema.workspaceInvites.token });
        return rows.length;
    }

    async listPendingByWorkspace(workspaceId: string): Promise<readonly Invite[]> {
        const rows = await this.db
            .select()
            .from(schema.workspaceInvites)
            .where(
                and(
                    eq(schema.workspaceInvites.workspaceId, workspaceId),
                    isNull(schema.workspaceInvites.acceptedAt),
                ),
            )
            .orderBy(desc(schema.workspaceInvites.createdAt));
        return rows.map(toInvite);
    }

    async countPendingByWorkspace(workspaceId: string): Promise<number> {
        const [row] = await this.db
            .select({ count: count() })
            .from(schema.workspaceInvites)
            .where(
                and(
                    eq(schema.workspaceInvites.workspaceId, workspaceId),
                    isNull(schema.workspaceInvites.acceptedAt),
                ),
            );
        return row?.count ?? 0;
    }
}

type InviteRow = typeof schema.workspaceInvites.$inferSelect;

function toInvite(row: InviteRow): Invite {
    return {
        token: row.token,
        workspaceId: row.workspaceId,
        email: row.email,
        invitedBy: row.invitedBy,
        role: toMemberRole(row.role),
        createdAt: row.createdAt,
        acceptedAt: row.acceptedAt,
        expiresAt: row.expiresAt,
    };
}
