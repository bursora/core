import type { ApiKey } from "./api-key";

export interface ApiKeyRepository {
    insert(input: {
        workspaceId: string;
        keyHash: string;
        name: string;
        scopes: readonly string[];
    }): Promise<ApiKey>;

    findByHash(keyHash: string): Promise<ApiKey | null>;

    /**
     * Returns the workspace's api keys, newest first. Revoked keys are
     * excluded by default so the dashboard list never briefly flashes a
     * revoked key after revoke. Pass `{ includeRevoked: true }` from the
     * audit/activity view that needs revoke events.
     */
    listByWorkspace(
        workspaceId: string,
        opts?: { readonly includeRevoked?: boolean },
    ): Promise<readonly ApiKey[]>;

    revoke(id: string, workspaceId: string, revokedAt: Date): Promise<boolean>;

    rename(id: string, workspaceId: string, name: string): Promise<boolean>;
}
