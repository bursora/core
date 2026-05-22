import type { Workspace } from "./workspace";

export interface WorkspaceCreateInput {
    readonly name: string;
    readonly environment?: string;
}

export interface WorkspaceRepository {
    create(input: WorkspaceCreateInput): Promise<Workspace>;
    findById(id: string): Promise<Workspace | null>;
    rename(id: string, name: string): Promise<Workspace>;
    setEnvironment(id: string, environment: string): Promise<Workspace>;
    delete(id: string): Promise<void>;
}
