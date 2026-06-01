import { issueApiKeyUseCase, renameApiKeyUseCase, revokeApiKeyUseCase } from "@/lib/identity";
import { parseEncryptionKey } from "@/lib/identity/api-key.cipher";
import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { InMemoryApiKeyAuditLogRepository } from "./fakes/in-memory-api-key-audit-log.repository";
import { InMemoryApiKeyRepository } from "./fakes/in-memory-api-key.repository";

const PEPPER = "test-pepper-do-not-use-in-prod";
const ENCRYPTION_KEY = parseEncryptionKey(randomBytes(32).toString("base64"));
const WORKSPACE_ID = "11111111-2222-3333-4444-555555555555";
const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const IP = "203.0.113.42";

describe("api key audit log", () => {
    test("issueApiKeyUseCase records a 'create' entry", async () => {
        const keys = new InMemoryApiKeyRepository();
        const audit = new InMemoryApiKeyAuditLogRepository();

        const issued = await issueApiKeyUseCase({
            workspaceId: WORKSPACE_ID,
            name: "ci",
            pepper: PEPPER,
            encryptionKey: ENCRYPTION_KEY,
            keys,
            audit,
            userId: USER_ID,
            ip: IP,
        });

        expect(audit.entries).toHaveLength(1);
        const entry = audit.entries[0]!;
        expect(entry.action).toBe("create");
        expect(entry.workspaceId).toBe(WORKSPACE_ID);
        expect(entry.apiKeyId).toBe(issued.id);
        expect(entry.userId).toBe(USER_ID);
        expect(entry.ip).toBe(IP);
    });

    test("revokeApiKeyUseCase records a 'revoke' entry on success", async () => {
        const keys = new InMemoryApiKeyRepository();
        const audit = new InMemoryApiKeyAuditLogRepository();

        const issued = await issueApiKeyUseCase({
            workspaceId: WORKSPACE_ID,
            name: "ci",
            pepper: PEPPER,
            encryptionKey: ENCRYPTION_KEY,
            keys,
            audit,
            userId: USER_ID,
            ip: IP,
        });
        audit.entries.length = 0;

        const ok = await revokeApiKeyUseCase({
            id: issued.id,
            workspaceId: WORKSPACE_ID,
            keys,
            audit,
            userId: USER_ID,
            ip: IP,
        });

        expect(ok).toBe(true);
        expect(audit.entries).toHaveLength(1);
        const entry = audit.entries[0]!;
        expect(entry.action).toBe("revoke");
        expect(entry.apiKeyId).toBe(issued.id);
        expect(entry.workspaceId).toBe(WORKSPACE_ID);
        expect(entry.userId).toBe(USER_ID);
        expect(entry.ip).toBe(IP);
    });

    test("renameApiKeyUseCase records a 'rename' entry with old + new name metadata", async () => {
        const keys = new InMemoryApiKeyRepository();
        const audit = new InMemoryApiKeyAuditLogRepository();

        const issued = await issueApiKeyUseCase({
            workspaceId: WORKSPACE_ID,
            name: "ci",
            pepper: PEPPER,
            encryptionKey: ENCRYPTION_KEY,
            keys,
            audit,
            userId: USER_ID,
            ip: IP,
        });
        audit.entries.length = 0;

        const ok = await renameApiKeyUseCase({
            id: issued.id,
            workspaceId: WORKSPACE_ID,
            name: "ci-renamed",
            keys,
            audit,
            userId: USER_ID,
            ip: IP,
        });

        expect(ok).toBe(true);
        expect(audit.entries).toHaveLength(1);
        const entry = audit.entries[0]!;
        expect(entry.action).toBe("rename");
        expect(entry.apiKeyId).toBe(issued.id);
        expect(entry.metadata).toMatchObject({ name: "ci-renamed" });
    });

    test("revokeApiKeyUseCase does not log when the key does not exist", async () => {
        const keys = new InMemoryApiKeyRepository();
        const audit = new InMemoryApiKeyAuditLogRepository();

        const ok = await revokeApiKeyUseCase({
            id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
            workspaceId: WORKSPACE_ID,
            keys,
            audit,
            userId: USER_ID,
            ip: IP,
        });

        expect(ok).toBe(false);
        expect(audit.entries).toHaveLength(0);
    });

    test("renameApiKeyUseCase does not log when the key does not exist", async () => {
        const keys = new InMemoryApiKeyRepository();
        const audit = new InMemoryApiKeyAuditLogRepository();

        const ok = await renameApiKeyUseCase({
            id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
            workspaceId: WORKSPACE_ID,
            name: "nope",
            keys,
            audit,
            userId: USER_ID,
            ip: IP,
        });

        expect(ok).toBe(false);
        expect(audit.entries).toHaveLength(0);
    });
});
