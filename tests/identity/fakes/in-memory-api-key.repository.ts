import type { ApiKey, ApiKeyRepository, ApiKeySeal } from "@/lib/identity";
import { randomUUID } from "node:crypto";

export class InMemoryApiKeyRepository implements ApiKeyRepository {
    private readonly rows = new Map<string, ApiKey>();

    async insert(input: {
        workspaceId: string;
        keyHash: string;
        seal: ApiKeySeal;
        last6: string;
        name: string;
        scopes: readonly string[];
    }): Promise<ApiKey> {
        const key: ApiKey = {
            id: randomUUID(),
            workspaceId: input.workspaceId,
            keyHash: input.keyHash,
            seal: input.seal,
            last6: input.last6,
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

    async findById(id: string, workspaceId: string): Promise<ApiKey | null> {
        const row = this.rows.get(id);
        if (!row || row.workspaceId !== workspaceId) return null;
        return row;
    }

    /**
     * Test seam: insert a row with no seal, mirroring a key issued before
     * encryption at rest existed. Lets the reveal use case exercise the
     * not-recoverable path without a DB.
     */
    insertLegacyForTest(input: {
        id: string;
        workspaceId: string;
        keyHash: string;
        name: string;
    }): void {
        this.rows.set(input.id, {
            id: input.id,
            workspaceId: input.workspaceId,
            keyHash: input.keyHash,
            seal: null,
            last6: null,
            name: input.name,
            scopes: [],
            createdAt: new Date(),
            revokedAt: null,
        });
    }

    async listByWorkspace(
        workspaceId: string,
        opts?: { readonly includeRevoked?: boolean },
    ): Promise<readonly ApiKey[]> {
        const includeRevoked = opts?.includeRevoked ?? false;
        return [...this.rows.values()].filter(
            (row) => row.workspaceId === workspaceId && (includeRevoked || row.revokedAt === null),
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
