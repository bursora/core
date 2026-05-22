CREATE TABLE "workspaces" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"                   text NOT NULL,
  "plan"                   text NOT NULL DEFAULT 'free',
  "stripe_customer_id"     text,
  "stripe_subscription_id" text,
  "created_at"             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "workspaces_stripe_customer_idx"
  ON "workspaces" ("stripe_customer_id")
  WHERE "stripe_customer_id" IS NOT NULL;
