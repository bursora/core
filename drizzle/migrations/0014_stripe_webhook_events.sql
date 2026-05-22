-- Idempotency log for Stripe webhook deliveries. Handler inserts event_id
-- before applying side effects; PK + ON CONFLICT DO NOTHING makes the
-- check-and-claim atomic so retried/replayed deliveries are no-ops.
CREATE TABLE "stripe_webhook_events" (
  "event_id"     text        PRIMARY KEY,
  "event_type"   text        NOT NULL,
  "processed_at" timestamptz NOT NULL DEFAULT now()
);
