/**
 * Detection tables.
 *
 * `alerts` is an append-only feed; the cron writes one row per detected
 * anomaly and the dashboard reads from it newest-first.
 *
 * Re-exported from the canonical declarations in `drizzle/schema.ts` during
 * the multi-feature migration. The cleanup slice physically relocates the
 * declarations here.
 */
export { alerts } from "@/lib/db";
