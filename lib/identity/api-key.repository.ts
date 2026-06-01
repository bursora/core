import type { ApiKey, ApiKeySeal } from "./api-key";

export interface ApiKeyRepository {
    insert(input: {
        workspaceId: string;
        keyHash: string;
        seal: ApiKeySeal;
        last6: string;
        name: string;
        scopes: readonly string[];
    }): Promise<ApiKey>;

    findByHash(keyHash: string): Promise<ApiKey | null>;

    /**
     * Fetch a single key by id, scoped to the owning workspace. Returns null
     * when the id is unknown or belongs to a different workspace — the caller
     * MUST pass the workspace id from the authenticated session so a member of
     * workspace A can never read workspace B's key (no IDOR).
     */
    findById(id: string, workspaceId: string): Promise<ApiKey | null>;

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
