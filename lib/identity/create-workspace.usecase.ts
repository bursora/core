import type { WorkspaceMember } from "./member";
import type { MemberRepository } from "./member.repository";
import type { Workspace } from "./workspace";
import type { WorkspaceRepository } from "./workspace.repository";

export interface CreateWorkspaceInput {
    readonly name: string;
    readonly ownerId: string;
    readonly environment?: string;
    readonly workspaces: WorkspaceRepository;
    readonly members: MemberRepository;
}

export interface CreateWorkspaceResult {
    readonly workspace: Workspace;
    readonly membership: WorkspaceMember;
}

const DEFAULT_ENVIRONMENT = "prod";

export async function createWorkspaceUseCase(
    input: CreateWorkspaceInput,
): Promise<CreateWorkspaceResult> {
    const name = input.name.trim();
    if (name.length === 0) {
        throw new Error("Workspace name cannot be empty");
    }

    const environment = input.environment?.trim() || DEFAULT_ENVIRONMENT;

    const workspace = await input.workspaces.create({
        name,
        environment,
    });
    const membership = await input.members.addMember({
        workspaceId: workspace.id,
        userId: input.ownerId,
        role: "owner",
    });

    return { workspace, membership };
}
