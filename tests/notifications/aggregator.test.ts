import { listNotifications, setNotificationsRepoForTesting } from "@/lib/notifications/server";
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

const seedAlert = async (overrides?: { id?: string; severity?: "critical" | "warning" }) => {
    await repo.insertIgnore([
        {
            workspaceId: WORKSPACE,
            userId: USER,
            source: "alert",
            dedupKey: `alert:${overrides?.id ?? "44444444-4444-4444-4444-444444444444"}`,
            severity: overrides?.severity ?? "critical",
            title: "Anomaly detected",
            body: "spike on agent X",
            href: `/workspace/${WORKSPACE}/alerts`,
        },
    ]);
};

const seedSetupError = async () => {
    await repo.insertIgnore([
        {
            workspaceId: WORKSPACE,
            userId: USER,
            source: "setup_error",
            dedupKey: "setup_error:ingest_invalid_body:2026-05-13T12:00:00.000Z",
            severity: "warning",
            title: "Invalid ingest payload",
            body: "2 ingest requests failed validation.",
            href: `/workspace/${WORKSPACE}`,
        },
    ]);
};

describe("listNotifications", () => {
    test("returns both setup_error and alert rows for a user", async () => {
        await seedAlert();
        await seedSetupError();

        const items = await listNotifications({ userId: USER });

        expect(items.map((i) => i.source).sort()).toEqual(["alert", "setup_error"]);
        expect(items[0]?.workspaceName).toBe("Acme");
    });

    test("returns rows from every workspace the user belongs to", async () => {
        const OTHER = "22222222-2222-2222-2222-222222222222";
        repo.setWorkspaceName(OTHER, "Beta");
        await repo.insertIgnore([
            {
                workspaceId: OTHER,
                userId: USER,
                source: "alert",
                dedupKey: "alert:other",
                severity: "critical",
                title: "Anomaly detected",
                body: "other-workspace spike",
                href: `/workspace/${OTHER}/alerts`,
            },
        ]);
        await seedAlert();

        const items = await listNotifications({ userId: USER });

        expect(items.map((i) => i.workspaceName).sort()).toEqual(["Acme", "Beta"]);
    });

    test("narrows by sources when provided", async () => {
        await seedAlert();
        await seedSetupError();

        const items = await listNotifications({ userId: USER, sources: ["setup_error"] });

        expect(items).toHaveLength(1);
        expect(items[0]?.source).toBe("setup_error");
    });

    test("alert item carries severity and href to alerts list", async () => {
        await seedAlert({ severity: "warning" });

        const items = await listNotifications({ userId: USER });

        expect(items).toHaveLength(1);
        const item = items[0]!;
        expect(item.source).toBe("alert");
        expect(item.severity).toBe("warning");
        expect(item.href).toBe(`/workspace/${WORKSPACE}/alerts`);
        expect(item.read).toBe(false);
    });

    test("read field reflects readAt", async () => {
        await seedAlert();
        const row = repo.rows[0]!;
        row.readAt = new Date();

        const items = await listNotifications({ userId: USER });

        expect(items).toHaveLength(0);
    });

    test("returns empty array when nothing is unread", async () => {
        const items = await listNotifications({ userId: USER });
        expect(items).toEqual([]);
    });
});
