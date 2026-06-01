import { API_KEY_PREFIX, issueApiKeyUseCase } from "@/lib/identity";
import { parseEncryptionKey } from "@/lib/identity/api-key.cipher";
import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { InMemoryApiKeyAuditLogRepository } from "./fakes/in-memory-api-key-audit-log.repository";
import { InMemoryApiKeyRepository } from "./fakes/in-memory-api-key.repository";

const PEPPER = "test-pepper-do-not-use-in-prod";
const ENCRYPTION_KEY = parseEncryptionKey(randomBytes(32).toString("base64"));

describe("issueApiKeyUseCase", () => {
    test("returns plaintext once and persists only the hash", async () => {
        const repo = new InMemoryApiKeyRepository();
        const workspaceId = "11111111-2222-3333-4444-555555555555";

        const issued = await issueApiKeyUseCase({
            workspaceId,
            name: "test",
            pepper: PEPPER,
            encryptionKey: ENCRYPTION_KEY,
            keys: repo,
            audit: new InMemoryApiKeyAuditLogRepository(),
        });

        expect(issued.workspaceId).toBe(workspaceId);
        expect(issued.plaintext.startsWith(`${API_KEY_PREFIX}${workspaceId}_`)).toBe(true);

        const stored = (await repo.listByWorkspace(workspaceId)).find((r) => r.id === issued.id);
        expect(stored).toBeDefined();
        expect(stored?.keyHash).not.toBe(issued.plaintext);
        expect(stored?.keyHash).not.toContain(issued.plaintext);
        expect(stored?.workspaceId).toBe(workspaceId);
    });

    test("issues unique keys on repeated calls", async () => {
        const repo = new InMemoryApiKeyRepository();
        const workspaceId = "11111111-2222-3333-4444-555555555555";

        const a = await issueApiKeyUseCase({
            workspaceId,
            name: "test",
            pepper: PEPPER,
            encryptionKey: ENCRYPTION_KEY,
            keys: repo,
            audit: new InMemoryApiKeyAuditLogRepository(),
        });
        const b = await issueApiKeyUseCase({
            workspaceId,
            name: "test",
            pepper: PEPPER,
            encryptionKey: ENCRYPTION_KEY,
            keys: repo,
            audit: new InMemoryApiKeyAuditLogRepository(),
        });

        expect(a.plaintext).not.toBe(b.plaintext);
        expect(a.id).not.toBe(b.id);
    });
});
