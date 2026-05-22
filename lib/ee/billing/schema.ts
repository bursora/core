/**
 * Billing tables.
 *
 * Billing state lives on the `workspaces` row (`stripe_customer_id`,
 * `stripe_subscription_id`, `subscription_status`). The workspace row is
 * shared with identity but those columns are billing-owned; the
 * `workspaces` table is re-exported here so consumers can reach the billing
 * columns through `@/lib/billing` without crossing into identity.
 *
 * Re-exported from the canonical declarations in `drizzle/schema.ts` during
 * the multi-feature migration. The cleanup slice physically relocates the
 * declarations here.
 */
export { workspaces } from "@/lib/db";
