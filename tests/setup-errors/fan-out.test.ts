import { recordSetupErrorUseCase } from "@/lib/setup-errors/server";
import { InMemoryNotificationsRepository } from "@/tests/notifications/fakes/in-memory-notifications.repository";
import { describe, expect, test } from "bun:test";
import { InMemorySetupErrorRepository } from "./fakes/in-memory-setup-error.repository";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const workspaceExists = (id: string): Promise<boolean> => Promise.resolve(id === WORKSPACE);

const members = (ids: readonly string[]) => async (workspaceId: string) =>
    workspaceId === WORKSPACE ? ids : [];

describe("recordSetupErrorUseCase — notification fan-out", () => {
    test("fans out one notification per workspace member when a bucket is newly created", async () => {
        const setupErrors = new InMemorySetupErrorRepository();
        const notifs = new InMemoryNotificationsRepository();

        await recordSetupErrorUseCase({
            input: { kind: "ingest_invalid_body", workspaceId: WORKSPACE },
            now: new Date("2025-05-10T12:34:56.000Z"),
            repo: setupErrors,
            workspaceExists,
            notifications: notifs,
            listMemberUserIds: members([USER_A, USER_B]),
        });

        expect(notifs.rows).toHaveLength(2);
        const byUser = new Map(notifs.rows.map((r) => [r.userId, r]));
        expect(byUser.has(USER_A)).toBe(true);
        expect(byUser.has(USER_B)).toBe(true);
        expect(notifs.rows[0]?.source).toBe("setup_error");
        expect(notifs.rows[0]?.dedupKey).toBe(
            "setup_error:ingest_invalid_body:2025-05-10T12:00:00.000Z",
        );
        expect(notifs.rows[0]?.title).toBe("Invalid ingest payload");
    });

    test("does NOT fan out a second time when the bucket already exists (only count increments)", async () => {
        const setupErrors = new InMemorySetupErrorRepository();
        const notifs = new InMemoryNotificationsRepository();

        const input = { kind: "ingest_invalid_body", workspaceId: WORKSPACE } as const;
        await recordSetupErrorUseCase({
            input,
            now: new Date("2025-05-10T12:00:00.000Z"),
            repo: setupErrors,
            workspaceExists,
            notifications: notifs,
            listMemberUserIds: members([USER_A, USER_B]),
        });
        await recordSetupErrorUseCase({
            input,
            now: new Date("2025-05-10T12:59:59.000Z"),
            repo: setupErrors,
            workspaceExists,
            notifications: notifs,
            listMemberUserIds: members([USER_A, USER_B]),
        });

        expect(setupErrors.rows[0]?.count).toBe(2);
        expect(notifs.rows).toHaveLength(2);
    });

    test("fans out again when a NEW hourly bucket is created (next hour)", async () => {
        const setupErrors = new InMemorySetupErrorRepository();
        const notifs = new InMemoryNotificationsRepository();

        const input = { kind: "ingest_invalid_body", workspaceId: WORKSPACE } as const;
        await recordSetupErrorUseCase({
            input,
            now: new Date("2025-05-10T12:00:00.000Z"),
            repo: setupErrors,
            workspaceExists,
            notifications: notifs,
            listMemberUserIds: members([USER_A]),
        });
        await recordSetupErrorUseCase({
            input,
            now: new Date("2025-05-10T13:00:00.000Z"),
            repo: setupErrors,
            workspaceExists,
            notifications: notifs,
            listMemberUserIds: members([USER_A]),
        });

        expect(notifs.rows).toHaveLength(2);
        const dedupKeys = notifs.rows.map((r) => r.dedupKey).sort();
        expect(dedupKeys).toEqual([
            "setup_error:ingest_invalid_body:2025-05-10T12:00:00.000Z",
            "setup_error:ingest_invalid_body:2025-05-10T13:00:00.000Z",
        ]);
    });

    test("does NOT fan out for global auth_unknown buckets (workspaceId null)", async () => {
        const setupErrors = new InMemorySetupErrorRepository();
        const notifs = new InMemoryNotificationsRepository();

        await recordSetupErrorUseCase({
            input: { kind: "auth_failure", workspaceId: null, hashPrefix: "deadbeef" },
            now: new Date("2025-05-10T12:00:00.000Z"),
            repo: setupErrors,
            workspaceExists,
            notifications: notifs,
            listMemberUserIds: members([USER_A]),
        });

        expect(setupErrors.rows[0]?.workspaceId).toBeNull();
        expect(notifs.rows).toHaveLength(0);
    });

    test("sdk_unknown_provider fans out one notification per member on first bucket", async () => {
        const setupErrors = new InMemorySetupErrorRepository();
        const notifs = new InMemoryNotificationsRepository();

        await recordSetupErrorUseCase({
            input: { kind: "sdk_unknown_provider", workspaceId: WORKSPACE },
            now: new Date("2025-05-10T12:34:56.000Z"),
            repo: setupErrors,
            workspaceExists,
            notifications: notifs,
            listMemberUserIds: members([USER_A, USER_B]),
        });

        expect(notifs.rows).toHaveLength(2);
        expect(notifs.rows[0]?.dedupKey).toBe(
            "setup_error:sdk_unknown_provider:2025-05-10T12:00:00.000Z",
        );
        expect(notifs.rows[0]?.source).toBe("setup_error");
    });

    test("sdk_unknown_provider does NOT fan out a second time on same bucket", async () => {
        const setupErrors = new InMemorySetupErrorRepository();
        const notifs = new InMemoryNotificationsRepository();

        const input = { kind: "sdk_unknown_provider", workspaceId: WORKSPACE } as const;
        await recordSetupErrorUseCase({
            input,
            now: new Date("2025-05-10T12:00:00.000Z"),
            repo: setupErrors,
            workspaceExists,
            notifications: notifs,
            listMemberUserIds: members([USER_A, USER_B]),
        });
        await recordSetupErrorUseCase({
            input,
            now: new Date("2025-05-10T12:59:59.000Z"),
            repo: setupErrors,
            workspaceExists,
            notifications: notifs,
            listMemberUserIds: members([USER_A, USER_B]),
        });

        expect(setupErrors.rows[0]?.count).toBe(2);
        expect(notifs.rows).toHaveLength(2);
    });
});
