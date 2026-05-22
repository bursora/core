import { describe, expect, test } from "bun:test";
import { InMemoryNotificationsRepository } from "./fakes/in-memory-notifications.repository";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const baseRow = {
    workspaceId: WORKSPACE,
    userId: USER_A,
    source: "setup_error",
    dedupKey: "setup_error:ingest_invalid_body:2026-05-13T12:00:00.000Z",
    severity: "critical",
    title: "Invalid ingest payload",
    body: "5 ingest requests failed validation.",
    href: "/workspace/x",
} as const;

describe("NotificationsRepository.insertIgnore", () => {
    test("inserts a new row", async () => {
        const repo = new InMemoryNotificationsRepository();
        await repo.insertIgnore([baseRow]);

        expect(repo.rows).toHaveLength(1);
        const row = repo.rows[0]!;
        expect(row.workspaceId).toBe(WORKSPACE);
        expect(row.userId).toBe(USER_A);
        expect(row.dedupKey).toBe(baseRow.dedupKey);
        expect(row.readAt).toBeNull();
        expect(typeof row.id).toBe("string");
    });

    test("dedup on (workspace, user, dedupKey) — second insert is a no-op", async () => {
        const repo = new InMemoryNotificationsRepository();
        await repo.insertIgnore([baseRow]);
        await repo.insertIgnore([baseRow]);

        expect(repo.rows).toHaveLength(1);
    });

    test("different users with same dedupKey each get their own row", async () => {
        const repo = new InMemoryNotificationsRepository();
        await repo.insertIgnore([baseRow, { ...baseRow, userId: USER_B }]);

        expect(repo.rows).toHaveLength(2);
        expect(repo.rows.map((r) => r.userId).sort()).toEqual([USER_A, USER_B].sort());
    });
});

describe("NotificationsRepository.listForUser", () => {
    test("returns unread rows for the user, sorted by createdAt desc", async () => {
        const repo = new InMemoryNotificationsRepository();
        await repo.insertIgnore([
            { ...baseRow, dedupKey: "k1" },
            { ...baseRow, dedupKey: "k2" },
        ]);

        const rows = await repo.listForUser({ workspaceId: WORKSPACE, userId: USER_A });
        expect(rows).toHaveLength(2);
        expect(rows.map((r) => r.dedupKey).sort()).toEqual(["k1", "k2"]);
    });

    test("filters by source", async () => {
        const repo = new InMemoryNotificationsRepository();
        await repo.insertIgnore([
            { ...baseRow, dedupKey: "k1", source: "setup_error" },
            { ...baseRow, dedupKey: "k2", source: "alert" },
        ]);

        const rows = await repo.listForUser({
            workspaceId: WORKSPACE,
            userId: USER_A,
            sources: ["setup_error"],
        });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.source).toBe("setup_error");
    });

    test("hides read rows unless includeRead is true", async () => {
        const repo = new InMemoryNotificationsRepository();
        await repo.insertIgnore([baseRow]);
        await repo.markRead({
            userId: USER_A,
            ids: [repo.rows[0]!.id],
            now: new Date(),
        });

        const unread = await repo.listForUser({ workspaceId: WORKSPACE, userId: USER_A });
        const all = await repo.listForUser({
            workspaceId: WORKSPACE,
            userId: USER_A,
            includeRead: true,
        });

        expect(unread).toHaveLength(0);
        expect(all).toHaveLength(1);
    });

    test("scopes to the user — other users' rows are not returned", async () => {
        const repo = new InMemoryNotificationsRepository();
        await repo.insertIgnore([baseRow, { ...baseRow, userId: USER_B }]);

        const rows = await repo.listForUser({ workspaceId: WORKSPACE, userId: USER_A });
        expect(rows).toHaveLength(1);
        expect(rows[0]?.userId).toBe(USER_A);
    });
});

describe("NotificationsRepository.markRead", () => {
    test("sets readAt for the given ids only", async () => {
        const repo = new InMemoryNotificationsRepository();
        await repo.insertIgnore([
            { ...baseRow, dedupKey: "k1" },
            { ...baseRow, dedupKey: "k2" },
        ]);
        const [row1, row2] = repo.rows;
        const now = new Date("2026-05-13T12:00:00.000Z");

        await repo.markRead({ userId: USER_A, ids: [row1!.id], now });

        const all = await repo.listForUser({
            workspaceId: WORKSPACE,
            userId: USER_A,
            includeRead: true,
        });
        const byId = new Map(all.map((r) => [r.id, r]));
        expect(byId.get(row1!.id)?.readAt?.getTime()).toBe(now.getTime());
        expect(byId.get(row2!.id)?.readAt).toBeNull();
    });

    test("is idempotent — second markRead does not overwrite readAt", async () => {
        const repo = new InMemoryNotificationsRepository();
        await repo.insertIgnore([baseRow]);
        const id = repo.rows[0]!.id;
        const first = new Date("2026-05-13T12:00:00.000Z");
        const second = new Date("2026-05-13T13:00:00.000Z");

        await repo.markRead({ userId: USER_A, ids: [id], now: first });
        await repo.markRead({ userId: USER_A, ids: [id], now: second });

        const all = await repo.listForUser({
            workspaceId: WORKSPACE,
            userId: USER_A,
            includeRead: true,
        });
        expect(all[0]?.readAt?.getTime()).toBe(first.getTime());
    });

    test("ignores rows owned by other users", async () => {
        const repo = new InMemoryNotificationsRepository();
        await repo.insertIgnore([baseRow]);
        await repo.insertIgnore([{ ...baseRow, userId: USER_B }]);
        const otherRow = repo.rows.find((r) => r.userId === USER_B)!;

        await repo.markRead({ userId: USER_A, ids: [otherRow.id], now: new Date() });

        const otherUnread = await repo.listForUser({ workspaceId: WORKSPACE, userId: USER_B });
        expect(otherUnread).toHaveLength(1);
    });
});
