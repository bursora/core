import { recordSetupErrorUseCase } from "@/lib/setup-errors/server";
import { InMemoryNotificationsRepository } from "@/tests/notifications/fakes/in-memory-notifications.repository";
import { describe, expect, test } from "bun:test";
import { InMemorySetupErrorRepository } from "./fakes/in-memory-setup-error.repository";

const noopNotifications = (): InMemoryNotificationsRepository =>
    new InMemoryNotificationsRepository();
const noopListMembers = async (): Promise<readonly string[]> => [];

const EXISTING_WORKSPACE = "11111111-2222-3333-4444-555555555555";

describe("recordSetupErrorUseCase", () => {
    test("known-workspace + ingest_invalid_body increments per-workspace bucket", async () => {
        const repo = new InMemorySetupErrorRepository();
        const now = new Date("2025-05-10T12:34:56.000Z");

        await recordSetupErrorUseCase({
            input: { kind: "ingest_invalid_body", workspaceId: EXISTING_WORKSPACE },
            now,
            repo,
            notifications: noopNotifications(),
            listMemberUserIds: noopListMembers,
        });

        expect(repo.rows.length).toBe(1);
        expect(repo.rows[0]?.workspaceId).toBe(EXISTING_WORKSPACE);
        expect(repo.rows[0]?.category).toBe("ingest_invalid_body");
        expect(repo.rows[0]?.bucketHour.toISOString()).toBe("2025-05-10T12:00:00.000Z");
        expect(repo.rows[0]?.count).toBe(1);
    });

    test("auth_failure with hashPrefix + sourceIp → global auth_unknown bucket (never per-workspace)", async () => {
        const repo = new InMemorySetupErrorRepository();

        await recordSetupErrorUseCase({
            input: { kind: "auth_failure", hashPrefix: "deadbeef", sourceIp: "203.0.113.7" },
            now: new Date("2025-05-10T12:34:56.000Z"),
            repo,
            notifications: noopNotifications(),
            listMemberUserIds: noopListMembers,
        });

        expect(repo.rows.length).toBe(1);
        expect(repo.rows[0]?.workspaceId).toBeNull();
        expect(repo.rows[0]?.category).toBe("auth_unknown");
    });

    test("auth_failure with no headers (hashPrefix + sourceIp null) → global auth_unknown bucket", async () => {
        const repo = new InMemorySetupErrorRepository();

        await recordSetupErrorUseCase({
            input: { kind: "auth_failure", hashPrefix: null, sourceIp: null },
            now: new Date("2025-05-10T12:34:56.000Z"),
            repo,
            notifications: noopNotifications(),
            listMemberUserIds: noopListMembers,
        });

        expect(repo.rows.length).toBe(1);
        expect(repo.rows[0]?.workspaceId).toBeNull();
        expect(repo.rows[0]?.category).toBe("auth_unknown");
    });

    test("two failures in the same hour collapse to one bucket with count=2", async () => {
        const repo = new InMemorySetupErrorRepository();
        const input = { kind: "ingest_invalid_body", workspaceId: EXISTING_WORKSPACE } as const;

        await recordSetupErrorUseCase({
            input,
            now: new Date("2025-05-10T12:00:00.000Z"),
            repo,
            notifications: noopNotifications(),
            listMemberUserIds: noopListMembers,
        });
        await recordSetupErrorUseCase({
            input,
            now: new Date("2025-05-10T12:59:59.000Z"),
            repo,
            notifications: noopNotifications(),
            listMemberUserIds: noopListMembers,
        });

        expect(repo.rows.length).toBe(1);
        expect(repo.rows[0]?.count).toBe(2);
    });

    test("sdk_unknown_provider increments per-workspace bucket", async () => {
        const repo = new InMemorySetupErrorRepository();

        await recordSetupErrorUseCase({
            input: { kind: "sdk_unknown_provider", workspaceId: EXISTING_WORKSPACE },
            now: new Date("2025-05-10T12:34:56.000Z"),
            repo,
            notifications: noopNotifications(),
            listMemberUserIds: noopListMembers,
        });

        expect(repo.rows.length).toBe(1);
        expect(repo.rows[0]?.workspaceId).toBe(EXISTING_WORKSPACE);
        expect(repo.rows[0]?.category).toBe("sdk_unknown_provider");
        expect(repo.rows[0]?.bucketHour.toISOString()).toBe("2025-05-10T12:00:00.000Z");
        expect(repo.rows[0]?.count).toBe(1);
    });
});
