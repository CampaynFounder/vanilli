-- ============================================================================
-- ADD REFRESH REQUEST COUNT TO GENERATIONS (Completion recheck rate limit)
-- ============================================================================
-- Allows customers to request a recheck of completion status (e.g. after webhook
-- missed). Refresh button becomes active after 10 minutes and is disabled after
-- 3 clicks to prevent abuse. Backend recheck-generation Edge Function increments
-- this and performs the actual Fal poll + DB update.

ALTER TABLE generations ADD COLUMN IF NOT EXISTS refresh_requests_count INTEGER NOT NULL DEFAULT 0
  CHECK (refresh_requests_count >= 0 AND refresh_requests_count <= 3);

COMMENT ON COLUMN generations.refresh_requests_count IS 'Number of completion-refresh requests (max 3). Recheck button enabled after 10 min, disabled after 3 clicks.';
