import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { and, count, desc, eq, gt, isNull } from "drizzle-orm";
import type { Invite, MemberRole, WorkspaceMember } from "./member";
import type { InviteRepository, MemberListRow, MemberRepository } from "./member.repository";

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
        if (!row) throw new Error("member insert returned no row");
        return toMember(row);
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

    async listByWorkspace(workspaceId: string): Promise<readonly MemberListRow[]> {
        const rows = await this.db
            .select({
                workspaceId: schema.workspaceMembers.workspaceId,
                userId: schema.workspaceMembers.userId,
                email: schema.users.email,
                role: schema.workspaceMembers.role,
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
            role: row.role === "owner" ? "owner" : "member",
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
}

type MemberRow = typeof schema.workspaceMembers.$inferSelect;

function toMember(row: MemberRow): WorkspaceMember {
    return {
        workspaceId: row.workspaceId,
        userId: row.userId,
        role: row.role === "owner" ? "owner" : "member",
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
        if (!row) throw new Error("invite insert returned no row");
        return toInvite(row);
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
        role: row.role === "owner" ? "owner" : "member",
        createdAt: row.createdAt,
        acceptedAt: row.acceptedAt,
        expiresAt: row.expiresAt,
    };
}
