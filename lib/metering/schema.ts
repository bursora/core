/**
 * Metering tables.
 *
 * Re-exported from the canonical declarations in `drizzle/schema.ts` during
 * the multi-feature migration. The `usage_events` parent is partitioned by
 * month at the SQL level — partition definitions live in the migration
 * files. The cleanup slice physically relocates these declarations here.
 */
export { usageEvents } from "@/lib/db";
