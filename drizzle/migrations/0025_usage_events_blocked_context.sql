-- Capture context for `status='blocked'` rows so the Blocks tab can show
-- what the SDK was about to spend. `intended_provider`/`intended_model`
-- reuse the existing nullable `provider`/`model` columns (NULL on rows
-- written before the decide endpoint surfaced them). The new columns are
-- NULL on `status='ok'` rows — they only apply to denials.
--
-- `est_cost_usd` mirrors the workspace's largest recent call cost: the
-- same safety-buffer figure the decide path uses to trip the cap. It is
-- the closest pre-call estimate of what the blocked call would have run.
--
-- `block_reason` is the protocol reason string emitted by `evaluateBudget`
-- (e.g. `workspace:*:over:1.8/2`). Keeps the wire format and the stored
-- row in lockstep so downstream parsers see one shape.
ALTER TABLE "usage_events"
    ADD COLUMN "est_cost_usd" numeric(14, 8),
    ADD COLUMN "block_reason" text;
