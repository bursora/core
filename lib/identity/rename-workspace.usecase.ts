import type { Workspace } from "./workspace";
import type { WorkspaceRepository } from "./workspace.repository";

export interface RenameWorkspaceInput {
    readonly id: string;
    readonly name: string;
    readonly workspaces: WorkspaceRepository;
}

const MAX_NAME_LENGTH = 80;

export async function renameWorkspaceUseCase(input: RenameWorkspaceInput): Promise<Workspace> {
    const name = input.name.trim().slice(0, MAX_NAME_LENGTH);
    if (name.length === 0) {
        throw new Error("Workspace name cannot be empty");
    }
    return input.workspaces.rename(input.id, name);
}
