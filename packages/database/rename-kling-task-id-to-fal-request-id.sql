-- ============================================================================
-- RENAME kling_task_id TO fal_request_id
-- ============================================================================
-- Renames kling_task_id column to fal_request_id to reflect that we're now
-- using fal.ai API instead of direct Kling API
-- Idempotent: safe to re-run

-- Rename column in video_chunks table
ALTER TABLE video_chunks RENAME COLUMN kling_task_id TO fal_request_id;

-- Rename column in generations table (if it exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'generations' AND column_name = 'kling_task_id'
    ) THEN
        ALTER TABLE generations RENAME COLUMN kling_task_id TO fal_request_id;
    END IF;
END $$;

-- Rename index
DROP INDEX IF EXISTS idx_video_chunks_kling_task_id;
CREATE INDEX IF NOT EXISTS idx_video_chunks_fal_request_id ON video_chunks(fal_request_id) WHERE fal_request_id IS NOT NULL;

-- Rename index on generations table (if it exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_generations_kling_task_id'
    ) THEN
        DROP INDEX idx_generations_kling_task_id;
        CREATE INDEX IF NOT EXISTS idx_generations_fal_request_id ON generations(fal_request_id) WHERE fal_request_id IS NOT NULL;
    END IF;
END $$;

-- Update comments
COMMENT ON COLUMN video_chunks.fal_request_id IS 'fal.ai request_id returned from queue API submission';
COMMENT ON COLUMN video_chunks.kling_requested_at IS 'Timestamp when fal.ai API was called for this chunk';
COMMENT ON COLUMN video_chunks.kling_completed_at IS 'Timestamp when fal.ai finished processing this chunk';
COMMENT ON COLUMN video_chunks.kling_video_url IS 'URL of fal.ai output video';
