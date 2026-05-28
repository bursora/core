-- Trial expiry for `trialing` subscriptions. Nullable: cloud workspaces that
-- never opened Checkout, every self-host workspace, and active/past_due
-- subscriptions leave it empty. The Lemon Squeezy webhook handler stamps
-- it from `data.attributes.trial_ends_at` on `subscription.activated`; the
-- monthly rollup compares it against `now()` to decide whether a trialing
-- workspace should be invoiced.
--
-- Pre-migration `trialing` rows (if any) keep `trial_ends_at` NULL — the
-- spend aggregator treats them as billable, matching the prior (buggy but
-- now documented) behavior, while every new trial is gated correctly.

ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamptz;
