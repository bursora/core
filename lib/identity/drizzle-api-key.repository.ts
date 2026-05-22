import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { ApiKey } from "./api-key";
import type { ApiKeyRepository } from "./api-key.repository";

export class DrizzleApiKeyRepository implements ApiKeyRepository {
    constructor(private readonly db: Db) {}

    async insert(input: {
        workspaceId: string;
        keyHash: string;
        name: string;
        scopes: readonly string[];
    }): Promise<ApiKey> {
        const [row] = await this.db
            .insert(schema.apiKeys)
            .values({
                workspaceId: input.workspaceId,
                keyHash: input.keyHash,
                name: input.name,
                scopes: [...input.scopes],
            })
            .returning();
        if (!row) throw new Error("api_key insert returned no row");
        return toApiKey(row);
    }

    async findByHash(keyHash: string): Promise<ApiKey | null> {
        const [row] = await this.db
            .select()
            .from(schema.apiKeys)
            .where(eq(schema.apiKeys.keyHash, keyHash))
            .limit(1);
        return row ? toApiKey(row) : null;
    }

    async listByWorkspace(workspaceId: string): Promise<readonly ApiKey[]> {
        const rows = await this.db
            .select()
            .from(schema.apiKeys)
            .where(eq(schema.apiKeys.workspaceId, workspaceId))
            .orderBy(desc(schema.apiKeys.createdAt));
        return rows.map(toApiKey);
    }

    async rename(id: string, workspaceId: string, name: string): Promise<boolean> {
        const result = await this.db
            .update(schema.apiKeys)
            .set({ name })
            .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.workspaceId, workspaceId)))
            .returning({ id: schema.apiKeys.id });
        return result.length > 0;
    }

    async revoke(id: string, workspaceId: string, revokedAt: Date): Promise<boolean> {
        const result = await this.db
            .update(schema.apiKeys)
            .set({ revokedAt })
            .where(
                and(
                    eq(schema.apiKeys.id, id),
                    eq(schema.apiKeys.workspaceId, workspaceId),
                    isNull(schema.apiKeys.revokedAt),
                ),
            )
            .returning({ id: schema.apiKeys.id });
        return result.length > 0;
    }
}

type Row = typeof schema.apiKeys.$inferSelect;

function toApiKey(row: Row): ApiKey {
    return {
        id: row.id,
        workspaceId: row.workspaceId,
        keyHash: row.keyHash,
        name: row.name,
        scopes: row.scopes,
        createdAt: row.createdAt,
        revokedAt: row.revokedAt,
    };
}
