/**
 * Server-only helper used by the dashboard AppShell. Returns every workspace
 * the user is a member of, joined with the workspace row so we have its name
 * and environment for the switcher. Lives in `lib/` (composition root) rather
 * than a domain context — there is no business logic, just a read-side query
 * for the chrome.
 */

import "server-only";

import { db, schema } from "@/lib/db";
import { desc, eq } from "drizzle-orm";

export interface UserWorkspace {
    readonly id: string;
    readonly name: string;
    readonly environment: string;
}

export async function listWorkspacesForUser(userId: string): Promise<UserWorkspace[]> {
    const rows = await db()
        .select({
            id: schema.workspaces.id,
            name: schema.workspaces.name,
            environment: schema.workspaces.environment,
        })
        .from(schema.workspaceMembers)
        .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
        .where(eq(schema.workspaceMembers.userId, userId))
        .orderBy(desc(schema.workspaces.createdAt));

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        environment: row.environment,
    }));
}
