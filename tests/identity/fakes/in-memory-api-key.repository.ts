import type { ApiKey, ApiKeyRepository } from "@/lib/identity";
import { randomUUID } from "node:crypto";

export class InMemoryApiKeyRepository implements ApiKeyRepository {
    private readonly rows = new Map<string, ApiKey>();

    async insert(input: {
        workspaceId: string;
        keyHash: string;
        name: string;
        scopes: readonly string[];
    }): Promise<ApiKey> {
        const key: ApiKey = {
            id: randomUUID(),
            workspaceId: input.workspaceId,
            keyHash: input.keyHash,
            name: input.name,
            scopes: [...input.scopes],
            createdAt: new Date(),
            revokedAt: null,
        };
        this.rows.set(key.id, key);
        return key;
    }

    async findByHash(keyHash: string): Promise<ApiKey | null> {
        for (const row of this.rows.values()) {
            if (row.keyHash === keyHash) return row;
        }
        return null;
    }

    async listByWorkspace(
        workspaceId: string,
        opts?: { readonly includeRevoked?: boolean },
    ): Promise<readonly ApiKey[]> {
        const includeRevoked = opts?.includeRevoked ?? false;
        return [...this.rows.values()].filter(
            (row) =>
                row.workspaceId === workspaceId && (includeRevoked || row.revokedAt === null),
        );
    }

    async rename(id: string, workspaceId: string, name: string): Promise<boolean> {
        const existing = this.rows.get(id);
        if (!existing || existing.workspaceId !== workspaceId) return false;
        this.rows.set(id, { ...existing, name });
        return true;
    }

    async revoke(id: string, workspaceId: string, revokedAt: Date): Promise<boolean> {
        const existing = this.rows.get(id);
        if (!existing || existing.workspaceId !== workspaceId) return false;
        this.rows.set(id, { ...existing, revokedAt });
        return true;
    }
}
