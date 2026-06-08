import {
    USER_ROLE,
    USER_STATUS,
    type UserRepository,
    type UserRole,
    type UserStatus,
} from "@/lib/identity";

interface UserState {
    role: UserRole;
    status: UserStatus;
    deletionScheduledAt: Date | null;
    sessions: number;
}

export class InMemoryUserRepository implements UserRepository {
    readonly deleted: string[] = [];
    private readonly users = new Map<string, UserState>();

    /** Test-only: register a user (active, with a live session, by default). */
    seed(userId: string, state?: Partial<UserState>): void {
        this.users.set(userId, {
            role: state?.role ?? USER_ROLE.user,
            status: state?.status ?? USER_STATUS.active,
            deletionScheduledAt: state?.deletionScheduledAt ?? null,
            sessions: state?.sessions ?? 1,
        });
    }

    state(userId: string): UserState | undefined {
        return this.users.get(userId);
    }

    async delete(userId: string): Promise<void> {
        this.deleted.push(userId);
        this.users.delete(userId);
    }

    async getRole(userId: string): Promise<UserRole | null> {
        return this.users.get(userId)?.role ?? null;
    }

    async getStatus(userId: string): Promise<UserStatus | null> {
        return this.users.get(userId)?.status ?? null;
    }

    async scheduleDeletion(userId: string, scheduledAt: Date): Promise<void> {
        const u = this.ensure(userId);
        u.status = USER_STATUS.pendingDeletion;
        u.deletionScheduledAt = scheduledAt;
    }

    async cancelDeletion(userId: string): Promise<void> {
        const u = this.ensure(userId);
        u.status = USER_STATUS.active;
        u.deletionScheduledAt = null;
    }

    async listDueForPurge(now: Date): Promise<readonly string[]> {
        return [...this.users.entries()]
            .filter(
                ([, s]) =>
                    s.status === USER_STATUS.pendingDeletion &&
                    s.deletionScheduledAt !== null &&
                    s.deletionScheduledAt.getTime() <= now.getTime(),
            )
            .map(([id]) => id);
    }

    async clearSessions(userId: string): Promise<void> {
        const u = this.users.get(userId);
        if (u) u.sessions = 0;
    }

    private ensure(userId: string): UserState {
        const existing = this.users.get(userId);
        if (existing) return existing;
        const created: UserState = {
            role: USER_ROLE.user,
            status: USER_STATUS.active,
            deletionScheduledAt: null,
            sessions: 1,
        };
        this.users.set(userId, created);
        return created;
    }
}
