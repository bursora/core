import type { IssuedApiKey } from "./api-key";
import { generateApiKeyPlaintext, hashApiKey } from "./api-key.crypto";
import type { ApiKeyRepository } from "./api-key.repository";

export interface IssueApiKeyInput {
    readonly workspaceId: string;
    readonly name: string;
    readonly pepper: string;
    readonly keys: ApiKeyRepository;
    readonly scopes?: readonly string[];
}

export async function issueApiKeyUseCase(input: IssueApiKeyInput): Promise<IssuedApiKey> {
    const plaintext = generateApiKeyPlaintext(input.workspaceId);
    const keyHash = hashApiKey(plaintext, input.pepper);

    const stored = await input.keys.insert({
        workspaceId: input.workspaceId,
        keyHash,
        name: input.name,
        scopes: input.scopes ?? [],
    });

    return {
        id: stored.id,
        workspaceId: stored.workspaceId,
        name: stored.name,
        plaintext,
        createdAt: stored.createdAt,
    };
}
