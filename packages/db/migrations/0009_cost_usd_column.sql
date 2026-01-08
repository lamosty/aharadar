-- Add USD cost tracking to provider_calls
-- Stores actual dollar cost calculated at call time

ALTER TABLE provider_calls
ADD COLUMN cost_estimate_usd NUMERIC(12,6) NOT NULL DEFAULT 0;

COMMENT ON COLUMN provider_calls.cost_estimate_usd IS 'Estimated USD cost based on token counts and model pricing at call time';

-- Index for cost aggregation queries
CREATE INDEX provider_calls_user_cost_idx ON provider_calls(user_id, started_at DESC, cost_estimate_usd);
