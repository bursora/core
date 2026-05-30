import type {
    Invite,
    InviteRepository,
    MemberListRow,
    MemberRepository,
    MemberRole,
    WorkspaceMember,
} from "@/lib/identity";

const key = (workspaceId: string, userId: string) => `${workspaceId}:${userId}`;

export class InMemoryMemberRepository implements MemberRepository {
    private readonly rows = new Map<string, WorkspaceMember>();
    private readonly userRoles = new Map<string, string>();

    /** Test-only: set a user's platform role so `findOwnerUserRole` can resolve it. */
    setUserRole(userId: string, role: string): void {
        this.userRoles.set(userId, role);
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

    async listByWorkspace(workspaceId: string): Promise<readonly MemberListRow[]> {
        return Array.from(this.rows.values())
            .filter((m) => m.workspaceId === workspaceId)
            .map((m) => ({
                workspaceId: m.workspaceId,
                userId: m.userId,
                email: `${m.userId}@example.test`,
                role: m.role,
                createdAt: m.createdAt,
            }));
    }

    async listMemberUserIds(workspaceId: string): Promise<readonly string[]> {
        return Array.from(this.rows.values())
            .filter((m) => m.workspaceId === workspaceId)
            .map((m) => m.userId);
    }

    async findOwnerUserRole(workspaceId: string): Promise<string | null> {
        const owner = Array.from(this.rows.values()).find(
            (m) => m.workspaceId === workspaceId && m.role === "owner",
        );
        if (!owner) return null;
        return this.userRoles.get(owner.userId) ?? "user";
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
