import type { WorkspaceRepository } from "./workspace.repository";

export interface DeleteWorkspaceInput {
    readonly id: string;
    readonly workspaces: WorkspaceRepository;
}

export async function deleteWorkspaceUseCase(input: DeleteWorkspaceInput): Promise<void> {
    await input.workspaces.delete(input.id);
}
