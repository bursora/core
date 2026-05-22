/**
 * Budgeting tables.
 *
 * Re-exported from the canonical declarations in `drizzle/schema.ts` during
 * the multi-feature migration. The `period CHECK IN ('daily','weekly','monthly')`
 * constraint is enforced at the SQL level via the migration files. The
 * cleanup slice physically relocates these declarations here.
 */
export { budgets } from "@/lib/db";
