import type { ApiKeyRepository } from "./api-key.repository";

export interface ApiKeyListItem {
    readonly id: string;
    readonly workspaceId: string;
    readonly name: string;
    readonly scopes: readonly string[];
    readonly createdAt: Date;
    readonly revokedAt: Date | null;
    /**
     * True when the plaintext is sealed at rest and can be revealed. False for
     * keys issued before encryption at rest existed — those must be rotated to
     * regain copy. Carries no secret material to the client, only the flag.
     */
    readonly revealable: boolean;
    /**
     * Non-secret trailing 6 chars of the plaintext, for a Stripe-style masked
     * suffix in the list. NULL on legacy rows → the cell falls back to dots.
     */
    readonly last6: string | null;
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
        revealable: row.seal !== null,
        last6: row.last6,
    }));
}
