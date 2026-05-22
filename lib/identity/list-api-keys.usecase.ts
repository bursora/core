import type { ApiKeyRepository } from "./api-key.repository";

export interface ApiKeyListItem {
    readonly id: string;
    readonly workspaceId: string;
    readonly name: string;
    readonly scopes: readonly string[];
    readonly createdAt: Date;
    readonly revokedAt: Date | null;
}

export interface ListApiKeysInput {
    readonly workspaceId: string;
    readonly keys: ApiKeyRepository;
}

/**
 * Lists API keys belonging to a workspace. Strips `keyHash` so the dashboard
 * never sees secret material. The caller MUST only pass the workspace id
 * derived from the authenticated session — never trust a request body.
 */
export async function listApiKeysUseCase(
    input: ListApiKeysInput,
): Promise<readonly ApiKeyListItem[]> {
    const rows = await input.keys.listByWorkspace(input.workspaceId);
    return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspaceId,
        name: row.name,
        scopes: row.scopes,
        createdAt: row.createdAt,
        revokedAt: row.revokedAt,
    }));
}
