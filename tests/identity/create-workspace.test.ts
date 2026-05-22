import { createWorkspaceUseCase } from "@/lib/identity";
import { describe, expect, test } from "bun:test";
import { InMemoryMemberRepository } from "./fakes/in-memory-member.repository";
import { InMemoryWorkspaceRepository } from "./fakes/in-memory-workspace.repository";

describe("createWorkspaceUseCase", () => {
    test("creates workspace and assigns the creator as owner", async () => {
        const workspaceRepo = new InMemoryWorkspaceRepository();
        const memberRepo = new InMemoryMemberRepository();

        const result = await createWorkspaceUseCase({
            name: "Acme",
            ownerId: "user-1",
            workspaces: workspaceRepo,
            members: memberRepo,
        });

        expect(result.workspace.name).toBe("Acme");
        expect(result.workspace.id).toBeTruthy();

        const membership = await memberRepo.findMembership(result.workspace.id, "user-1");
        expect(membership).not.toBeNull();
        expect(membership?.role).toBe("owner");
    });

    test("rejects empty name", async () => {
        const workspaceRepo = new InMemoryWorkspaceRepository();
        const memberRepo = new InMemoryMemberRepository();

        await expect(
            createWorkspaceUseCase({
                name: "  ",
                ownerId: "user-1",
                workspaces: workspaceRepo,
                members: memberRepo,
            }),
        ).rejects.toThrow();
    });

    test("defaults environment to 'prod' when omitted", async () => {
        const workspaceRepo = new InMemoryWorkspaceRepository();
        const memberRepo = new InMemoryMemberRepository();

        const result = await createWorkspaceUseCase({
            name: "Acme",
            ownerId: "user-1",
            workspaces: workspaceRepo,
            members: memberRepo,
        });

        expect(result.workspace.environment).toBe("prod");
    });

    test("persists supplied environment", async () => {
        const workspaceRepo = new InMemoryWorkspaceRepository();
        const memberRepo = new InMemoryMemberRepository();

        const result = await createWorkspaceUseCase({
            name: "Acme",
            ownerId: "user-1",
            environment: "  staging  ",
            workspaces: workspaceRepo,
            members: memberRepo,
        });

        expect(result.workspace.environment).toBe("staging");
    });
});
