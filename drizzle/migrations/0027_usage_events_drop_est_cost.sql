-- Drop the per-row safety-buffer denormalization. The column stored the
-- workspace-wide `MAX(cost_usd)` over 24h at decide time, which is a single
-- constant copied across every blocked row. The Blocks tab now derives a
-- true per-model average cost at read time, so the column adds no signal.
ALTER TABLE "usage_events"
    DROP COLUMN "est_cost_usd";
