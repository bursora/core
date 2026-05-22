import {
    issueApiKeyUseCase,
    listApiKeysUseCase,
    lookupApiKeyUseCase,
    revokeApiKeyUseCase,
} from "@/lib/identity";
import { describe, expect, test } from "bun:test";
import { InMemoryApiKeyRepository } from "./fakes/in-memory-api-key.repository";

const PEPPER = "isolation-pepper";
const WORKSPACE_A = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const WORKSPACE_B = "11111111-2222-3333-4444-555555555555";

describe("api-key workspace isolation", () => {
    test("listApiKeys never returns keys from another workspace", async () => {
        const repo = new InMemoryApiKeyRepository();

        await issueApiKeyUseCase({
            workspaceId: WORKSPACE_A,
            name: "test",
            pepper: PEPPER,
            keys: repo,
        });
        await issueApiKeyUseCase({
            workspaceId: WORKSPACE_A,
            name: "test",
            pepper: PEPPER,
            keys: repo,
        });
        await issueApiKeyUseCase({
            workspaceId: WORKSPACE_B,
            name: "test",
            pepper: PEPPER,
            keys: repo,
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
            keys: repo,
        });

        const result = await listApiKeysUseCase({ workspaceId: WORKSPACE_A, keys: repo });
        expect(result[0]).not.toHaveProperty("keyHash");
    });

    test("revoke fails silently when caller's workspace does not own the key", async () => {
        const repo = new InMemoryApiKeyRepository();
        const issued = await issueApiKeyUseCase({
            workspaceId: WORKSPACE_A,
            name: "test",
            pepper: PEPPER,
            keys: repo,
        });

        const result = await revokeApiKeyUseCase({
            id: issued.id,
            workspaceId: WORKSPACE_B,
            keys: repo,
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
