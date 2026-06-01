import {
    issueApiKeyUseCase,
    listApiKeysUseCase,
    lookupApiKeyUseCase,
    revokeApiKeyUseCase,
} from "@/lib/identity";
import { describe, expect, test } from "bun:test";
import { InMemoryApiKeyAuditLogRepository } from "./fakes/in-memory-api-key-audit-log.repository";
import { InMemoryApiKeyRepository } from "./fakes/in-memory-api-key.repository";

import { parseEncryptionKey } from "@/lib/identity/api-key.cipher";
import { randomBytes } from "node:crypto";

const PEPPER = "isolation-pepper";
const ENCRYPTION_KEY = parseEncryptionKey(randomBytes(32).toString("base64"));
const WORKSPACE_A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const WORKSPACE_B = "11111111-2222-3333-4444-555555555555";

describe("api-key workspace isolation", () => {
    test("listApiKeys never returns keys from another workspace", async () => {
        const repo = new InMemoryApiKeyRepository();
        const audit = new InMemoryApiKeyAuditLogRepository();

        await issueApiKeyUseCase({
            workspaceId: WORKSPACE_A,
            name: "test",
            pepper: PEPPER,
            encryptionKey: ENCRYPTION_KEY,
            keys: repo,
            audit,
        });
        await issueApiKeyUseCase({
            workspaceId: WORKSPACE_A,
            name: "test",
            pepper: PEPPER,
            encryptionKey: ENCRYPTION_KEY,
            keys: repo,
            audit,
        });
        await issueApiKeyUseCase({
            workspaceId: WORKSPACE_B,
            name: "test",
            pepper: PEPPER,
            encryptionKey: ENCRYPTION_KEY,
            keys: repo,
            audit,
        });

        const aKeys = await listApiKeysUseCase({ workspaceId: WORKSPACE_A, keys: repo });
        expect(aKeys).toHaveLength(2);
        expect(aKeys.every((k) => k.workspaceId === WORKSPACE_A)).toBe(true);

        const bKeys = await listApiKeysUseCase({ workspaceId: WORKSPACE_B, keys: repo });
        expect(bKeys).toHaveLength(1);
        expect(bKeys[0]?.workspaceId).toBe(WORKSPACE_B);
    });

    test("listApiKeys does not expose key_hash plaintext or hashes", async () => {
        const repo = new InMemoryApiKeyRepository();
        await issueApiKeyUseCase({
            workspaceId: WORKSPACE_A,
            name: "test",
            pepper: PEPPER,
            encryptionKey: ENCRYPTION_KEY,
            keys: repo,
            audit: new InMemoryApiKeyAuditLogRepository(),
        });

        const result = await listApiKeysUseCase({ workspaceId: WORKSPACE_A, keys: repo });
        expect(result[0]).not.toHaveProperty("keyHash");
    });

    test("revoke fails silently when caller's workspace does not own the key", async () => {
        const repo = new InMemoryApiKeyRepository();
        const audit = new InMemoryApiKeyAuditLogRepository();
        const issued = await issueApiKeyUseCase({
            workspaceId: WORKSPACE_A,
            name: "test",
            pepper: PEPPER,
            encryptionKey: ENCRYPTION_KEY,
            keys: repo,
            audit,
        });

        const result = await revokeApiKeyUseCase({
            id: issued.id,
            workspaceId: WORKSPACE_B,
            keys: repo,
            audit,
        });

        expect(result).toBe(false);

        const stillActive = await lookupApiKeyUseCase({
            plaintext: issued.plaintext,
            pepper: PEPPER,
            keys: repo,
        });
        expect(stillActive).not.toBeNull();
    });
});
