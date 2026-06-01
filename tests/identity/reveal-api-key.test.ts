import { parseEncryptionKey } from "@/lib/identity/api-key.cipher";
import { issueApiKeyUseCase } from "@/lib/identity/issue-api-key.usecase";
import { revealApiKeyUseCase } from "@/lib/identity/reveal-api-key.usecase";
import { describe, expect, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import { InMemoryApiKeyAuditLogRepository } from "./fakes/in-memory-api-key-audit-log.repository";
import { InMemoryApiKeyRepository } from "./fakes/in-memory-api-key.repository";

const PEPPER = "reveal-pepper";
const KEY = parseEncryptionKey(randomBytes(32).toString("base64"));
const WORKSPACE_A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const WORKSPACE_B = "11111111-2222-3333-4444-555555555555";

async function issue(repo: InMemoryApiKeyRepository, workspaceId: string) {
    return issueApiKeyUseCase({
        workspaceId,
        name: "test",
        pepper: PEPPER,
        encryptionKey: KEY,
        keys: repo,
        audit: new InMemoryApiKeyAuditLogRepository(),
    });
}

describe("revealApiKeyUseCase", () => {
    test("returns the original plaintext for a key in the caller's workspace", async () => {
        const repo = new InMemoryApiKeyRepository();
        const audit = new InMemoryApiKeyAuditLogRepository();
        const issued = await issue(repo, WORKSPACE_A);

        const result = await revealApiKeyUseCase({
            id: issued.id,
            workspaceId: WORKSPACE_A,
            encryptionKey: KEY,
            keys: repo,
            audit,
        });

        expect(result.kind).toBe("ok");
        if (result.kind === "ok") expect(result.plaintext).toBe(issued.plaintext);
    });

    test("records an audit entry on successful reveal (who + when)", async () => {
        const repo = new InMemoryApiKeyRepository();
        const audit = new InMemoryApiKeyAuditLogRepository();
        const issued = await issue(repo, WORKSPACE_A);
        const userId = randomUUID();

        await revealApiKeyUseCase({
            id: issued.id,
            workspaceId: WORKSPACE_A,
            encryptionKey: KEY,
            keys: repo,
            audit,
            userId,
        });

        const reveal = audit.entries.find((e) => e.action === "reveal");
        expect(reveal).toBeDefined();
        expect(reveal?.apiKeyId).toBe(issued.id);
        expect(reveal?.workspaceId).toBe(WORKSPACE_A);
        expect(reveal?.userId).toBe(userId);
        expect(reveal?.ts).toBeInstanceOf(Date);
    });

    test("returns not-found for a key owned by another workspace (IDOR guard)", async () => {
        const repo = new InMemoryApiKeyRepository();
        const audit = new InMemoryApiKeyAuditLogRepository();
        const issued = await issue(repo, WORKSPACE_A);

        const result = await revealApiKeyUseCase({
            id: issued.id,
            workspaceId: WORKSPACE_B,
            encryptionKey: KEY,
            keys: repo,
            audit,
        });

        expect(result.kind).toBe("not_found");
    });

    test("does not write an audit entry when the key is not found", async () => {
        const repo = new InMemoryApiKeyRepository();
        const audit = new InMemoryApiKeyAuditLogRepository();
        const issued = await issue(repo, WORKSPACE_A);

        await revealApiKeyUseCase({
            id: issued.id,
            workspaceId: WORKSPACE_B,
            encryptionKey: KEY,
            keys: repo,
            audit,
        });

        expect(audit.entries).toHaveLength(0);
    });

    test("returns not_recoverable for a legacy key with no seal", async () => {
        const repo = new InMemoryApiKeyRepository();
        const audit = new InMemoryApiKeyAuditLogRepository();
        const legacyId = randomUUID();
        repo.insertLegacyForTest({
            id: legacyId,
            workspaceId: WORKSPACE_A,
            keyHash: "legacy-hash",
            name: "legacy",
        });

        const result = await revealApiKeyUseCase({
            id: legacyId,
            workspaceId: WORKSPACE_A,
            encryptionKey: KEY,
            keys: repo,
            audit,
        });

        expect(result.kind).toBe("not_recoverable");
        expect(audit.entries).toHaveLength(0);
    });

    test("returns not-found for a revoked key", async () => {
        const repo = new InMemoryApiKeyRepository();
        const audit = new InMemoryApiKeyAuditLogRepository();
        const issued = await issue(repo, WORKSPACE_A);
        await repo.revoke(issued.id, WORKSPACE_A, new Date());

        const result = await revealApiKeyUseCase({
            id: issued.id,
            workspaceId: WORKSPACE_A,
            encryptionKey: KEY,
            keys: repo,
            audit,
        });

        expect(result.kind).toBe("not_found");
    });
});
