import "server-only";

import type { Db } from "@/lib/db";
import { schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { Workspace } from "./workspace";
import type { WorkspaceCreateInput, WorkspaceRepository } from "./workspace.repository";

export class DrizzleWorkspaceRepository implements WorkspaceRepository {
    constructor(private readonly db: Db) {}

    async create(input: WorkspaceCreateInput): Promise<Workspace> {
        const [row] = await this.db
            .insert(schema.workspaces)
            .values({
                name: input.name,
                ...(input.environment ? { environment: input.environment } : {}),
            })
            .returning();
        if (!row) throw new Error("workspace insert returned no row");
        return toDomain(row);
    }

    async findById(id: string): Promise<Workspace | null> {
        const [row] = await this.db
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, id))
            .limit(1);
        return row ? toDomain(row) : null;
    }

    async rename(id: string, name: string): Promise<Workspace> {
        const [row] = await this.db
            .update(schema.workspaces)
            .set({ name })
            .where(eq(schema.workspaces.id, id))
            .returning();
        if (!row) throw new Error("workspace not found");
        return toDomain(row);
    }

    async setEnvironment(id: string, environment: string): Promise<Workspace> {
        const [row] = await this.db
            .update(schema.workspaces)
            .set({ environment })
            .where(eq(schema.workspaces.id, id))
            .returning();
        if (!row) throw new Error("workspace not found");
        return toDomain(row);
    }

    async delete(id: string): Promise<void> {
        await this.db.delete(schema.workspaces).where(eq(schema.workspaces.id, id));
    }
}

type Row = typeof schema.workspaces.$inferSelect;

function toDomain(row: Row): Workspace {
    return {
        id: row.id,
        name: row.name,
        environment: row.environment,
        createdAt: row.createdAt,
    };
}
