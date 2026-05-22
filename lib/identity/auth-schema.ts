/**
 * better-auth tables (users, session, account, verification).
 *
 * Re-exported from the canonical declarations in `drizzle/schema.ts` during
 * the multi-feature migration. The cleanup slice physically relocates the
 * declarations here.
 */
export { account, session, users, verification } from "@/lib/db";
