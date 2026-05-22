import type { Workspace } from "./workspace";
import type { WorkspaceRepository } from "./workspace.repository";

export interface SetWorkspaceEnvironmentInput {
    readonly id: string;
    readonly environment: string;
    readonly workspaces: WorkspaceRepository;
}

const MAX_ENVIRONMENT_LENGTH = 40;

export async function setWorkspaceEnvironmentUseCase(
    input: SetWorkspaceEnvironmentInput,
): Promise<Workspace> {
    const environment = input.environment.trim().slice(0, MAX_ENVIRONMENT_LENGTH);
    if (environment.length === 0) {
        throw new Error("Workspace environment cannot be empty");
    }
    return input.workspaces.setEnvironment(input.id, environment);
}
