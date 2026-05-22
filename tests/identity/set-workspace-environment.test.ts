import { setWorkspaceEnvironmentUseCase } from "@/lib/identity";
import { describe, expect, test } from "bun:test";
import { InMemoryWorkspaceRepository } from "./fakes/in-memory-workspace.repository";

describe("setWorkspaceEnvironmentUseCase", () => {
    test("updates environment and returns the updated workspace", async () => {
        const workspaces = new InMemoryWorkspaceRepository();
        const created = await workspaces.create({ name: "Acme" });

        const result = await setWorkspaceEnvironmentUseCase({
            id: created.id,
            environment: "  staging  ",
            workspaces,
        });

        expect(result.environment).toBe("staging");
        const fetched = await workspaces.findById(created.id);
        expect(fetched?.environment).toBe("staging");
    });

    test("rejects empty environment", async () => {
        const workspaces = new InMemoryWorkspaceRepository();
        const created = await workspaces.create({ name: "Acme" });

        await expect(
            setWorkspaceEnvironmentUseCase({
                id: created.id,
                environment: "   ",
                workspaces,
            }),
        ).rejects.toThrow();
    });

    test("throws when workspace does not exist", async () => {
        const workspaces = new InMemoryWorkspaceRepository();

        await expect(
            setWorkspaceEnvironmentUseCase({
                id: "00000000-0000-0000-0000-000000000000",
                environment: "prod",
                workspaces,
            }),
        ).rejects.toThrow();
    });
});
