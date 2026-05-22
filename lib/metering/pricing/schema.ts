/**
 * Pricing tables.
 *
 * Re-exported from the canonical declarations in `drizzle/schema.ts` during
 * the multi-feature migration. The cleanup slice physically relocates the
 * declarations here. The SQL exclusion constraint (`pricing_no_overlap`) lives
 * in the migration files and is preserved unchanged.
 */
export { pricing } from "@/lib/db";
