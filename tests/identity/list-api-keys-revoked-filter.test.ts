/**
 * Contract test for `ApiKeyRepository.listByWorkspace` filtering.
 *
 * After a key is revoked, the dashboard list must not include it. The audit
 * view explicitly opts in to seeing revoked rows via `{ includeRevoked: true }`.
 */

import type { ApiKeySeal } from "@/lib/identity";
import { describe, expect, test } from "bun:test";
import { InMemoryApiKeyRepository } from "./fakes/in-memory-api-key.repository";

const WORKSPACE = "11111111-2222-3333-4444-555555555555";
const SEAL: ApiKeySeal = { cipherText: "ct", cipherIv: "iv", cipherAuthTag: "tag" };

describe("ApiKeyRepository.listByWorkspace revoked filter", () => {
    test("hides revoked keys by default", async () => {
        const repo = new InMemoryApiKeyRepository();
        await repo.insert({
            workspaceId: WORKSPACE,
            keyHash: "hash-active",
            seal: SEAL,
            last6: "active",
            name: "active",
            scopes: [],
        });
        const toRevoke = await repo.insert({
            workspaceId: WORKSPACE,
            keyHash: "hash-revoked",
            seal: SEAL,
            last6: "revokd",
            name: "old",
            scopes: [],
        });
        await repo.revoke(toRevoke.id, WORKSPACE, new Date());

        const result = await repo.listByWorkspace(WORKSPACE);

        expect(result).toHaveLength(1);
        expect(result[0]?.keyHash).toBe("hash-active");
    });

    test("returns revoked keys when includeRevoked is true", async () => {
        const repo = new InMemoryApiKeyRepository();
        await repo.insert({
            workspaceId: WORKSPACE,
            keyHash: "hash-active",
            seal: SEAL,
            last6: "active",
            name: "active",
            scopes: [],
        });
        const toRevoke = await repo.insert({
            workspaceId: WORKSPACE,
            keyHash: "hash-revoked",
            seal: SEAL,
            last6: "revokd",
            name: "old",
            scopes: [],
        });
        await repo.revoke(toRevoke.id, WORKSPACE, new Date());

        const result = await repo.listByWorkspace(WORKSPACE, { includeRevoked: true });

        expect(result).toHaveLength(2);
    });
});
