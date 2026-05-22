import { issueApiKeyUseCase, lookupApiKeyUseCase, revokeApiKeyUseCase } from "@/lib/identity";
import { describe, expect, test } from "bun:test";
import { InMemoryApiKeyRepository } from "./fakes/in-memory-api-key.repository";

const PEPPER = "test-pepper";
const WORKSPACE = "11111111-2222-3333-4444-555555555555";

describe("lookupApiKeyUseCase", () => {
    test("returns id, workspaceId, scopes for an active key", async () => {
        const repo = new InMemoryApiKeyRepository();
        const issued = await issueApiKeyUseCase({
            workspaceId: WORKSPACE,
            name: "test",
            pepper: PEPPER,
            keys: repo,
            scopes: ["events:write"],
        });

        const lookup = await lookupApiKeyUseCase({
            plaintext: issued.plaintext,
            pepper: PEPPER,
            keys: repo,
        });

        expect(lookup).not.toBeNull();
        expect(lookup?.id).toBe(issued.id);
        expect(lookup?.workspaceId).toBe(WORKSPACE);
        expect(lookup?.scopes).toEqual(["events:write"]);
    });

    test("returns null for an unknown plaintext", async () => {
        const repo = new InMemoryApiKeyRepository();

        const lookup = await lookupApiKeyUseCase({
            plaintext: `bsk_${WORKSPACE}_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
            pepper: PEPPER,
            keys: repo,
        });

        expect(lookup).toBeNull();
    });

    test("returns null for a revoked key", async () => {
        const repo = new InMemoryApiKeyRepository();
        const issued = await issueApiKeyUseCase({
            workspaceId: WORKSPACE,
            name: "test",
            pepper: PEPPER,
            keys: repo,
        });

        await revokeApiKeyUseCase({
            id: issued.id,
            workspaceId: WORKSPACE,
            keys: repo,
        });

        const lookup = await lookupApiKeyUseCase({
            plaintext: issued.plaintext,
            pepper: PEPPER,
            keys: repo,
        });

        expect(lookup).toBeNull();
    });

    test("returns null for a malformed plaintext", async () => {
        const repo = new InMemoryApiKeyRepository();

        const lookup = await lookupApiKeyUseCase({
            plaintext: "not-a-bursora-key",
            pepper: PEPPER,
            keys: repo,
        });

        expect(lookup).toBeNull();
    });
});
