/**
 * Tests for listNotificationsPage — paginated cross-workspace feed for the
 * bell. Covers the cap, the cursor, and clamping the limit at the max.
 */

import {
    DEFAULT_NOTIFICATIONS_PAGE_LIMIT,
    listNotificationsPage,
    MAX_NOTIFICATIONS_PAGE_LIMIT,
    setNotificationsRepoForTesting,
} from "@/lib/notifications/server";
import { InMemoryNotificationsRepository } from "@/tests/notifications/fakes/in-memory-notifications.repository";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

let repo: InMemoryNotificationsRepository;

beforeEach(() => {
    repo = new InMemoryNotificationsRepository();
    repo.setWorkspaceName(WORKSPACE, "Acme");
    setNotificationsRepoForTesting(repo);
});

afterEach(() => setNotificationsRepoForTesting(null));

const seedRows = async (count: number) => {
    const rows = Array.from({ length: count }, (_, i) => ({
        workspaceId: WORKSPACE,
        userId: USER,
        source: "alert" as const,
        dedupKey: `k-${String(i).padStart(4, "0")}`,
        severity: "warning" as const,
        title: `t-${i}`,
        body: `b-${i}`,
        href: null,
    }));
    await repo.insertIgnore(rows);
    // Force distinct, monotonically increasing createdAt so cursor pagination is deterministic.
    for (let i = 0; i < repo.rows.length; i++) {
        repo.rows[i]!.createdAt = new Date(2026, 0, 1, 0, 0, i);
    }
};

describe("listNotificationsPage", () => {
    test("returns all items with nextCursor=null when under default limit", async () => {
        await seedRows(3);
        const page = await listNotificationsPage({ userId: USER });
        expect(page.items).toHaveLength(3);
        expect(page.nextCursor).toBeNull();
    });

    test("caps at the default limit and emits a nextCursor", async () => {
        await seedRows(DEFAULT_NOTIFICATIONS_PAGE_LIMIT + 10);
        const page = await listNotificationsPage({ userId: USER });
        expect(page.items).toHaveLength(DEFAULT_NOTIFICATIONS_PAGE_LIMIT);
        expect(page.nextCursor).not.toBeNull();
    });

    test("follows the cursor through all pages without duplicates or gaps", async () => {
        await seedRows(60);

        const first = await listNotificationsPage({ userId: USER, limit: 25 });
        expect(first.items).toHaveLength(25);
        expect(first.nextCursor).not.toBeNull();

        const second = await listNotificationsPage({
            userId: USER,
            limit: 25,
            cursor: first.nextCursor,
        });
        expect(second.items).toHaveLength(25);
        expect(second.nextCursor).not.toBeNull();

        const third = await listNotificationsPage({
            userId: USER,
            limit: 25,
            cursor: second.nextCursor,
        });
        expect(third.items).toHaveLength(10);
        expect(third.nextCursor).toBeNull();

        const allIds = [
            ...first.items.map((i) => i.id),
            ...second.items.map((i) => i.id),
            ...third.items.map((i) => i.id),
        ];
        expect(new Set(allIds).size).toBe(60);
    });

    test("clamps limit above the max", async () => {
        await seedRows(MAX_NOTIFICATIONS_PAGE_LIMIT + 50);
        const page = await listNotificationsPage({
            userId: USER,
            limit: 9999,
        });
        expect(page.items).toHaveLength(MAX_NOTIFICATIONS_PAGE_LIMIT);
    });

    test("ignores a malformed cursor and returns the first page", async () => {
        await seedRows(3);
        const page = await listNotificationsPage({
            userId: USER,
            cursor: "garbage-cursor",
        });
        expect(page.items).toHaveLength(3);
    });
});
