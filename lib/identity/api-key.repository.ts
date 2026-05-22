import type { ApiKey } from "./api-key";

export interface ApiKeyRepository {
    insert(input: {
        workspaceId: string;
        keyHash: string;
        name: string;
        scopes: readonly string[];
    }): Promise<ApiKey>;

    findByHash(keyHash: string): Promise<ApiKey | null>;

    listByWorkspace(workspaceId: string): Promise<readonly ApiKey[]>;

    revoke(id: string, workspaceId: string, revokedAt: Date): Promise<boolean>;

    rename(id: string, workspaceId: string, name: string): Promise<boolean>;
}
