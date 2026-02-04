-- Task 156: Digest LLM usage estimates and actuals
-- Store estimated and actual LLM usage for each digest run

ALTER TABLE digests ADD COLUMN IF NOT EXISTS usage_estimate JSONB;
ALTER TABLE digests ADD COLUMN IF NOT EXISTS usage_actual JSONB;

COMMENT ON COLUMN digests.usage_estimate IS 'Estimated LLM usage for this digest run (tokens + credits)';
COMMENT ON COLUMN digests.usage_actual IS 'Actual LLM usage aggregated from provider_calls';
