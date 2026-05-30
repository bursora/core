/**
 * Integration tests for /api/internal/user/notifications — cross-workspace
 * feed for the bell.
 */

import { setNotificationsRepoForTesting } from "@/lib/notifications/server";
import { InMemoryNotificationsRepository } from "@/tests/notifications/fakes/in-memory-notifications.repository";
import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test";

const USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const WORKSPACE_A = "11111111-2222-3333-4444-555555555555";
const WORKSPACE_B = "22222222-3333-4444-5555-666666666666";

let session: { user: { id: string } } | null = null;

beforeAll(() => {
    mock.module("@/lib/auth", () => ({
        auth: { api: { getSession: async () => session } },
        getRequestSession: async () => session,
        requireSessionUI: async () => session,
    }));
    mock.module("next/headers", () => ({ headers: async () => new Headers() }));
});

// mock.module is process-global; restore at file end so the @/lib/auth stub
// doesn't leak into later files that import the real auth (e.g. the user-role
// schema test reading auth.options).
afterAll(() => mock.restore());

let repo: InMemoryNotificationsRepository;

const setup = async () => {
    repo = new InMemoryNotificationsRepository();
    repo.setWorkspaceName(WORKSPACE_A, "Acme");
    repo.setWorkspaceName(WORKSPACE_B, "Beta");
    setNotificationsRepoForTesting(repo);
    await repo.insertIgnore([
        {
            workspaceId: WORKSPACE_A,
            userId: USER_ID,
            source: "setup_error",
            dedupKey: "setup_error:auth_revoked:2026-05-13T10:00:00.000Z",
            severity: "warning",
            title: "Unrecognized API key",
            body: "3 requests in the last 24h were rejected with unauthorized.",
            href: `/workspace/${WORKSPACE_A}`,
        },
        {
            workspaceId: WORKSPACE_B,
            userId: USER_ID,
            source: "alert",
            dedupKey: "alert:b-1",
            severity: "critical",
            title: "Anomaly detected",
            body: "Spend spike on workspace B",
            href: `/workspace/${WORKSPACE_B}/alerts`,
        },
    ]);
};

const teardown = () => {
    setNotificationsRepoForTesting(null);
    session = null;
};

const callGet = async (query?: Record<string, string>) => {
    const { GET } = await import("@/app/api/internal/user/notifications/route");
    const url = new URL("http://localhost/api/internal/user/notifications");
    if (query) {
        for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    }
    return GET(new Request(url));
};

const callPost = async (body: unknown) => {
    const { POST } = await import("@/app/api/internal/user/notifications/route");
    const req = new Request("http://localhost/api/internal/user/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    return POST(req);
};

describe("GET /api/internal/user/notifications", () => {
    afterEach(teardown);

    test("returns 401 when no session", async () => {
        await setup();
        const res = await callGet();
        expect(res.status).toBe(401);
    });

    test("returns items from every workspace the user belongs to", async () => {
        session = { user: { id: USER_ID } };
        await setup();

        const res = await callGet();
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            items: { workspaceId: string; workspaceName: string }[];
            nextCursor: string | null;
        };
        expect(body.items).toHaveLength(2);
        expect(body.items.map((i) => i.workspaceName).sort()).toEqual(["Acme", "Beta"]);
        expect(body.nextCursor).toBeNull();
    });

    test("caps at 50 items by default and returns a nextCursor for the rest", async () => {
        session = { user: { id: USER_ID } };
        repo = new InMemoryNotificationsRepository();
        repo.setWorkspaceName(WORKSPACE_A, "Acme");
        setNotificationsRepoForTesting(repo);
        // Insert 60 rows with distinct dedup keys + distinct createdAt so order is stable.
        const seed = Array.from({ length: 60 }, (_, i) => ({
            workspaceId: WORKSPACE_A,
            userId: USER_ID,
            source: "alert" as const,
            dedupKey: `k-${String(i).padStart(3, "0")}`,
            severity: "warning" as const,
            title: `t-${i}`,
            body: `b-${i}`,
            href: null,
        }));
        await repo.insertIgnore(seed);
        // Force distinct createdAt so cursor pagination is deterministic.
        for (let i = 0; i < repo.rows.length; i++) {
            repo.rows[i]!.createdAt = new Date(2026, 0, 1, 0, 0, i);
        }

        const first = await callGet();
        expect(first.status).toBe(200);
        const firstBody = (await first.json()) as {
            items: { id: string }[];
            nextCursor: string | null;
        };
        expect(firstBody.items).toHaveLength(50);
        expect(firstBody.nextCursor).not.toBeNull();

        const second = await callGet({ cursor: firstBody.nextCursor! });
        expect(second.status).toBe(200);
        const secondBody = (await second.json()) as {
            items: { id: string }[];
            nextCursor: string | null;
        };
        expect(secondBody.items).toHaveLength(10);
        expect(secondBody.nextCursor).toBeNull();

        // No id appears in both pages.
        const firstIds = new Set(firstBody.items.map((i) => i.id));
        const overlap = secondBody.items.filter((i) => firstIds.has(i.id));
        expect(overlap).toEqual([]);
    });

    test("rejects limit above 100", async () => {
        session = { user: { id: USER_ID } };
        await setup();
        const res = await callGet({ limit: "500" });
        expect(res.status).toBe(400);
    });

    test("honors a smaller limit query param", async () => {
        session = { user: { id: USER_ID } };
        await setup();
        const res = await callGet({ limit: "1" });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { items: unknown[]; nextCursor: string | null };
        expect(body.items).toHaveLength(1);
        expect(body.nextCursor).not.toBeNull();
    });
});

describe("POST /api/internal/user/notifications", () => {
    afterEach(teardown);

    test("returns 401 when no session", async () => {
        await setup();
        const res = await callPost({ itemIds: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"] });
        expect(res.status).toBe(401);
    });

    test("returns 400 for malformed body", async () => {
        session = { user: { id: USER_ID } };
        await setup();
        const res = await callPost({ itemIds: 42 });
        expect(res.status).toBe(400);
    });

    test("marks the given ids regardless of which workspace they belong to", async () => {
        session = { user: { id: USER_ID } };
        await setup();
        const ids = repo.rows.map((r) => r.id);
        const res = await callPost({ itemIds: ids });
        expect(res.status).toBe(200);
        expect(repo.rows.every((r) => r.readAt !== null)).toBe(true);
    });

    test("itemIds=all marks every unread item across all workspaces", async () => {
        session = { user: { id: USER_ID } };
        await setup();
        const res = await callPost({ itemIds: "all" });
        expect(res.status).toBe(200);
        expect(repo.rows.every((r) => r.readAt !== null)).toBe(true);
    });
});
