/**
 * App-owned identity tables (users, workspaces, workspace_members,
 * workspace_invites, api_keys).
 *
 * Re-exported from the canonical declarations in `drizzle/schema.ts` during
 * the multi-feature migration. The cleanup slice physically relocates the
 * declarations here.
 */
export { apiKeys, users, workspaceInvites, workspaceMembers, workspaces } from "@/lib/db";
