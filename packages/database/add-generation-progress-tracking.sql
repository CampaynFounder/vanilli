-- ============================================================================
-- ADD PROGRESS TRACKING TO GENERATIONS TABLE
-- ============================================================================
-- Add columns to track processing progress and estimated completion time
-- This enables accurate progress indicators for async processing

-- Add progress_percentage column (0-100)
ALTER TABLE generations ADD COLUMN IF NOT EXISTS progress_percentage INTEGER DEFAULT 0 
  CHECK (progress_percentage >= 0 AND progress_percentage <= 100);

-- Add estimated_completion_time (when the generation is expected to complete)
ALTER TABLE generations ADD COLUMN IF NOT EXISTS estimated_completion_at TIMESTAMPTZ;

-- Add current_processing_stage (for display purposes)
-- First drop the constraint if it exists, then add the updated one
ALTER TABLE generations DROP CONSTRAINT IF EXISTS generations_current_stage_check;
ALTER TABLE generations ADD CONSTRAINT generations_current_stage_check
  CHECK (current_stage IN ('pending', 'analyzing', 'processing_chunks', 'stitching', 'finalizing', 'completed', 'failed', 'cancelled'));

-- Add started_at timestamp (when processing actually started)
ALTER TABLE generations ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- Create index for progress queries
CREATE INDEX IF NOT EXISTS idx_generations_progress ON generations(progress_percentage, status) 
  WHERE status IN ('pending', 'processing');

-- Update the trigger function to set started_at when status changes to processing
CREATE OR REPLACE FUNCTION set_generation_started_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set started_at when status changes to 'processing'
  IF NEW.status = 'processing' AND (OLD.status IS NULL OR OLD.status != 'processing') THEN
    NEW.started_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_generation_started_at ON generations;
CREATE TRIGGER trg_set_generation_started_at
  BEFORE UPDATE ON generations
  FOR EACH ROW
  EXECUTE FUNCTION set_generation_started_at();
