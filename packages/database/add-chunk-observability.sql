-- ============================================================================
-- ADD CHUNK OBSERVABILITY COLUMNS
-- ============================================================================
-- Adds detailed tracking columns to video_chunks table for observability
-- This allows backend monitoring of which chunks are sent to Kling, 
-- which images are used, and timing/sync information
-- Idempotent: safe to re-run

-- Add observability columns to video_chunks table
ALTER TABLE video_chunks ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE video_chunks ADD COLUMN IF NOT EXISTS image_index INTEGER;
ALTER TABLE video_chunks ADD COLUMN IF NOT EXISTS video_chunk_url TEXT;  -- The video chunk URL sent to Kling
ALTER TABLE video_chunks ADD COLUMN IF NOT EXISTS video_chunk_start_time FLOAT;  -- Start time in original video (seconds)
ALTER TABLE video_chunks ADD COLUMN IF NOT EXISTS audio_start_time FLOAT;  -- Calculated audio start time (seconds)
ALTER TABLE video_chunks ADD COLUMN IF NOT EXISTS sync_offset FLOAT;  -- Sync offset used for this chunk
ALTER TABLE video_chunks ADD COLUMN IF NOT EXISTS chunk_duration FLOAT;  -- Duration of this chunk (seconds)
ALTER TABLE video_chunks ADD COLUMN IF NOT EXISTS kling_requested_at TIMESTAMPTZ;  -- When Kling API was called
ALTER TABLE video_chunks ADD COLUMN IF NOT EXISTS kling_completed_at TIMESTAMPTZ;  -- When Kling finished processing
ALTER TABLE video_chunks ADD COLUMN IF NOT EXISTS kling_video_url TEXT;  -- URL of Kling output video

-- Add indexes for observability queries
CREATE INDEX IF NOT EXISTS idx_video_chunks_kling_task_id ON video_chunks(kling_task_id) WHERE kling_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_video_chunks_kling_requested ON video_chunks(kling_requested_at) WHERE kling_requested_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_video_chunks_image_index ON video_chunks(image_index) WHERE image_index IS NOT NULL;

-- Add comment to table documenting observability purpose
COMMENT ON TABLE video_chunks IS 'Tracks individual video chunks with full observability: image used, video/audio timing, Kling task IDs, and timestamps for debugging and validation';

-- Add comments to key observability columns
COMMENT ON COLUMN video_chunks.image_url IS 'URL of the image sent to Kling with this chunk';
COMMENT ON COLUMN video_chunks.image_index IS '0-based index of which image from the target_images array was used';
COMMENT ON COLUMN video_chunks.video_chunk_url IS 'Signed URL of the video chunk sent to Kling API';
COMMENT ON COLUMN video_chunks.video_chunk_start_time IS 'Start time of this chunk in the original user video (seconds)';
COMMENT ON COLUMN video_chunks.audio_start_time IS 'Calculated start time for audio extraction (includes sync_offset)';
COMMENT ON COLUMN video_chunks.sync_offset IS 'Sync offset applied to align audio with video for this chunk';
COMMENT ON COLUMN video_chunks.kling_task_id IS 'Kling API task ID returned from motion-control endpoint';
COMMENT ON COLUMN video_chunks.kling_requested_at IS 'Timestamp when Kling API was called for this chunk';
COMMENT ON COLUMN video_chunks.kling_completed_at IS 'Timestamp when Kling finished processing this chunk';
