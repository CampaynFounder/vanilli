-- Add user_bpm column to video_jobs table
-- This allows users to optionally provide BPM/tempo for better audio alignment
-- If provided, this BPM will be used instead of calculating it with librosa

ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS user_bpm FLOAT;

-- Add comment explaining the column
COMMENT ON COLUMN video_jobs.user_bpm IS 'Optional user-provided BPM/tempo. If provided, used for chunk calculation instead of auto-detected BPM.';
