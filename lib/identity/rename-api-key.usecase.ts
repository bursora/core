import type { ApiKeyRepository } from "./api-key.repository";

export interface RenameApiKeyInput {
    readonly id: string;
    readonly workspaceId: string;
    readonly name: string;
    readonly keys: ApiKeyRepository;
}

export async function renameApiKeyUseCase(input: RenameApiKeyInput): Promise<boolean> {
    return input.keys.rename(input.id, input.workspaceId, input.name);
}
