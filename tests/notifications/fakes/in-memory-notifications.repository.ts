import type {
    InsertNotificationInput,
    NotificationRow,
    NotificationsCursor,
    NotificationsRepository,
} from "@/lib/notifications/notifications.repository";
import type { NotificationDisplay, NotificationSource } from "@/lib/notifications/types";

type MutableRow = {
    -readonly [K in keyof NotificationRow]: NotificationRow[K];
};

export class InMemoryNotificationsRepository implements NotificationsRepository {
    readonly rows: MutableRow[] = [];
    private readonly workspaceNames = new Map<string, string>();
    private nextId = 1;

    /** Pre-register a workspace's display name so list/insert can populate `workspaceName`. */
    setWorkspaceName(workspaceId: string, name: string): void {
        this.workspaceNames.set(workspaceId, name);
    }

    private makeId(): string {
        const n = (this.nextId++).toString(16).padStart(12, "0");
        return `00000000-0000-0000-0000-${n}`;
    }

    private nameFor(workspaceId: string): string {
        return this.workspaceNames.get(workspaceId) ?? workspaceId;
    }

    async insertIgnore(inputs: readonly InsertNotificationInput[]): Promise<void> {
        for (const input of inputs) {
            const exists = this.rows.find(
                (r) =>
                    r.workspaceId === input.workspaceId &&
                    r.userId === input.userId &&
                    r.dedupKey === input.dedupKey,
            );
            if (exists) continue;
            this.rows.push({
                id: this.makeId(),
                workspaceId: input.workspaceId,
                workspaceName: this.nameFor(input.workspaceId),
                userId: input.userId,
                source: input.source,
                dedupKey: input.dedupKey,
                severity: input.severity,
                title: input.title,
                body: input.body,
                href: input.href,
                display: input.display ?? "inline",
                createdAt: new Date(),
                readAt: null,
            });
        }
    }

    async listForUser(input: {
        userId: string;
        workspaceId?: string;
        sources?: readonly NotificationSource[];
        includeRead?: boolean;
        display?: NotificationDisplay;
        limit?: number;
        cursor?: NotificationsCursor;
    }): Promise<readonly NotificationRow[]> {
        const sorted = this.rows
            .filter((r) => r.userId === input.userId)
            .filter((r) => (input.workspaceId ? r.workspaceId === input.workspaceId : true))
            .filter((r) => (input.sources ? input.sources.includes(r.source) : true))
            .filter((r) => (input.display ? r.display === input.display : true))
            .filter((r) => (input.includeRead ? true : r.readAt === null))
            .sort((a, b) => {
                const dt = b.createdAt.getTime() - a.createdAt.getTime();
                if (dt !== 0) return dt;
                return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
            });

        const afterCursor = input.cursor
            ? sorted.filter((r) => {
                  const ms = r.createdAt.getTime();
                  if (ms < input.cursor!.createdAtMs) return true;
                  if (ms === input.cursor!.createdAtMs && r.id < input.cursor!.id) return true;
                  return false;
              })
            : sorted;

        return input.limit !== undefined ? afterCursor.slice(0, input.limit) : afterCursor;
    }

    async markRead(input: { userId: string; ids: readonly string[]; now: Date }): Promise<void> {
        for (const r of this.rows) {
            if (r.userId !== input.userId) continue;
            if (!input.ids.includes(r.id)) continue;
            if (r.readAt === null) r.readAt = input.now;
        }
    }

    async markAllRead(input: { userId: string; now: Date }): Promise<void> {
        for (const r of this.rows) {
            if (r.userId !== input.userId) continue;
            if (r.readAt === null) r.readAt = input.now;
        }
    }
}
