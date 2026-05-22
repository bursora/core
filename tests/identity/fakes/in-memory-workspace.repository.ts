import type { Workspace, WorkspaceCreateInput, WorkspaceRepository } from "@/lib/identity";
import { randomUUID } from "node:crypto";

export class InMemoryWorkspaceRepository implements WorkspaceRepository {
    private readonly rows = new Map<string, Workspace>();

    async create(input: WorkspaceCreateInput): Promise<Workspace> {
        const workspace: Workspace = {
            id: randomUUID(),
            name: input.name,
            environment: input.environment ?? "prod",
            createdAt: new Date(),
        };
        this.rows.set(workspace.id, workspace);
        return workspace;
    }

    async findById(id: string): Promise<Workspace | null> {
        return this.rows.get(id) ?? null;
    }

    async rename(id: string, name: string): Promise<Workspace> {
        const existing = this.rows.get(id);
        if (!existing) throw new Error("workspace not found");
        const updated: Workspace = { ...existing, name };
        this.rows.set(id, updated);
        return updated;
    }

    async setEnvironment(id: string, environment: string): Promise<Workspace> {
        const existing = this.rows.get(id);
        if (!existing) throw new Error("workspace not found");
        const updated: Workspace = { ...existing, environment };
        this.rows.set(id, updated);
        return updated;
    }

    async delete(id: string): Promise<void> {
        this.rows.delete(id);
    }
}
