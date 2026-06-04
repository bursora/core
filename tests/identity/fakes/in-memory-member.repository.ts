import {
    type Invite,
    type InviteRepository,
    type MemberListRow,
    type MemberRepository,
    type MemberRole,
    USER_ROLE,
    USER_STATUS,
    type UserRole,
    type UserStatus,
    type WorkspaceMember,
} from "@/lib/identity";

const key = (workspaceId: string, userId: string) => `${workspaceId}:${userId}`;

export class InMemoryMemberRepository implements MemberRepository {
    private readonly rows = new Map<string, WorkspaceMember>();
    private readonly userRoles = new Map<string, UserRole>();
    private readonly userStatuses = new Map<string, UserStatus>();

    /** Test-only: set a user's platform role so `findOwnerUserRole` can resolve it. */
    setUserRole(userId: string, role: UserRole): void {
        this.userRoles.set(userId, role);
    }

    /** Test-only: set a user's account status so `listByWorkspace` surfaces it. */
    setUserStatus(userId: string, status: UserStatus): void {
        this.userStatuses.set(userId, status);
    }

    async addMember(input: {
        workspaceId: string;
        userId: string;
        role: MemberRole;
    }): Promise<WorkspaceMember> {
        const member: WorkspaceMember = {
            workspaceId: input.workspaceId,
            userId: input.userId,
            role: input.role,
            createdAt: new Date(),
        };
        this.rows.set(key(input.workspaceId, input.userId), member);
        return member;
    }

    async findMembership(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
        return this.rows.get(key(workspaceId, userId)) ?? null;
    }

    async removeMember(workspaceId: string, userId: string): Promise<void> {
        this.rows.delete(key(workspaceId, userId));
    }

    async updateRole(workspaceId: string, userId: string, role: MemberRole): Promise<void> {
        const existing = this.rows.get(key(workspaceId, userId));
        if (existing) this.rows.set(key(workspaceId, userId), { ...existing, role });
    }

    async countOwners(workspaceId: string): Promise<number> {
        return Array.from(this.rows.values()).filter(
            (m) => m.workspaceId === workspaceId && m.role === "owner",
        ).length;
    }

    async listWorkspaceIdsForUser(userId: string): Promise<readonly string[]> {
        return Array.from(this.rows.values())
            .filter((m) => m.userId === userId)
            .map((m) => m.workspaceId);
    }

    async listByWorkspace(workspaceId: string): Promise<readonly MemberListRow[]> {
        return Array.from(this.rows.values())
            .filter((m) => m.workspaceId === workspaceId)
            .map((m) => ({
                workspaceId: m.workspaceId,
                userId: m.userId,
                email: `${m.userId}@example.test`,
                image: null,
                role: m.role,
                status: this.userStatuses.get(m.userId) ?? USER_STATUS.active,
                createdAt: m.createdAt,
            }));
    }

    async listMemberUserIds(workspaceId: string): Promise<readonly string[]> {
        return Array.from(this.rows.values())
            .filter((m) => m.workspaceId === workspaceId)
            .map((m) => m.userId);
    }

    async findOwnerUserRole(workspaceId: string): Promise<UserRole | null> {
        return this.resolveOwner(workspaceId)?.platformRole ?? null;
    }

    async findOwnerUserId(workspaceId: string): Promise<string | null> {
        return this.resolveOwner(workspaceId)?.userId ?? null;
    }

    /** Mirror the Drizzle repo: prefer an admin owner, else a stable order. */
    private resolveOwner(workspaceId: string) {
        const [owner] = Array.from(this.rows.values())
            .filter((m) => m.workspaceId === workspaceId && m.role === "owner")
            .map((m) => ({ ...m, platformRole: this.userRoles.get(m.userId) ?? USER_ROLE.user }))
            .sort(
                (a, b) =>
                    Number(b.platformRole === USER_ROLE.admin) -
                        Number(a.platformRole === USER_ROLE.admin) ||
                    a.createdAt.getTime() - b.createdAt.getTime() ||
                    a.userId.localeCompare(b.userId),
            );
        return owner;
    }
}

export class InMemoryInviteRepository implements InviteRepository {
    private readonly rows = new Map<string, Invite>();

    /** Test-only: artificial delay inside `findByToken` to widen the TOCTOU window. */
    findByTokenDelayMs = 0;

    async create(input: {
        token: string;
        workspaceId: string;
        email: string;
        invitedBy: string;
        role: MemberRole;
        expiresAt: Date;
    }): Promise<Invite> {
        const invite: Invite = {
            token: input.token,
            workspaceId: input.workspaceId,
            email: input.email,
            invitedBy: input.invitedBy,
            role: input.role,
            createdAt: new Date(),
            acceptedAt: null,
            expiresAt: input.expiresAt,
        };
        this.rows.set(input.token, invite);
        return invite;
    }

    async findByToken(token: string): Promise<Invite | null> {
        if (this.findByTokenDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.findByTokenDelayMs));
        }
        return this.rows.get(token) ?? null;
    }

    async claim(token: string, acceptedAt: Date): Promise<Invite | null> {
        const existing = this.rows.get(token);
        if (!existing || existing.acceptedAt !== null) return null;
        if (existing.expiresAt.getTime() <= acceptedAt.getTime()) return null;
        const claimed: Invite = { ...existing, acceptedAt };
        this.rows.set(token, claimed);
        return claimed;
    }

    async deletePending(input: { workspaceId: string; email: string }): Promise<number> {
        let removed = 0;
        for (const [token, row] of this.rows) {
            if (
                row.workspaceId === input.workspaceId &&
                row.email === input.email &&
                row.acceptedAt === null
            ) {
                this.rows.delete(token);
                removed += 1;
            }
        }
        return removed;
    }

    async listPendingByWorkspace(workspaceId: string): Promise<readonly Invite[]> {
        return [...this.rows.values()]
            .filter((r) => r.workspaceId === workspaceId && r.acceptedAt === null)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }

    async countPendingByWorkspace(workspaceId: string): Promise<number> {
        let n = 0;
        for (const row of this.rows.values()) {
            if (row.workspaceId === workspaceId && row.acceptedAt === null) n += 1;
        }
        return n;
    }
}
