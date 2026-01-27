-- ============================================================================
-- ADD DEMO TIER AND CHUNK TRACKING
-- ============================================================================
-- Adds 'demo' tier to all tier checks and creates chunk tracking table
-- Idempotent: safe to re-run

-- Update users table tier check
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tier_check;
ALTER TABLE users ADD CONSTRAINT users_tier_check 
  CHECK (tier IN ('free', 'open_mic', 'artist', 'label', 'industry', 'demo'));

-- Update subscriptions table tier check
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tier_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_tier_check 
  CHECK (tier IN ('open_mic', 'artist', 'label', 'industry', 'demo'));

-- Update video_jobs table: Add demo tier and analysis fields
ALTER TABLE video_jobs DROP CONSTRAINT IF EXISTS video_jobs_tier_check;
ALTER TABLE video_jobs ADD CONSTRAINT video_jobs_tier_check 
  CHECK (tier IN ('open_mic', 'artist', 'label', 'industry', 'demo'));

-- Add analysis result fields to video_jobs (for tempo-based chunking)
ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS sync_offset FLOAT;
ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS bpm FLOAT;
ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS chunk_duration FLOAT;
ALTER TABLE video_jobs ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'PENDING_ANALYSIS' 
  CHECK (analysis_status IN ('PENDING_ANALYSIS', 'ANALYZED', 'FAILED'));

-- Update status enum to include analysis states
ALTER TABLE video_jobs DROP CONSTRAINT IF EXISTS video_jobs_status_check;
ALTER TABLE video_jobs ADD CONSTRAINT video_jobs_status_check 
  CHECK (status IN ('PENDING', 'PENDING_ANALYSIS', 'ANALYZED', 'PROCESSING', 'COMPLETED', 'FAILED'));

-- ============================================================================
-- VIDEO CHUNKS TABLE (Track individual chunks for multi-chunk jobs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS video_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES video_jobs(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
  chunk_index INTEGER NOT NULL,  -- 0-based index
  status TEXT NOT NULL DEFAULT 'PENDING' 
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  video_url TEXT,  -- Final chunk video URL (after Kling + audio mux)
  kling_task_id TEXT,
  error_message TEXT,
  credits_charged INTEGER DEFAULT 0,  -- Only charge for successful chunks
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(job_id, chunk_index)
);

-- Indexes for chunk queries
CREATE INDEX IF NOT EXISTS idx_video_chunks_job_id ON video_chunks(job_id);
CREATE INDEX IF NOT EXISTS idx_video_chunks_generation_id ON video_chunks(generation_id);
CREATE INDEX IF NOT EXISTS idx_video_chunks_status ON video_chunks(status);
CREATE INDEX IF NOT EXISTS idx_video_chunks_job_index ON video_chunks(job_id, chunk_index);

-- RLS Policies for video_chunks
ALTER TABLE video_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_chunks_select_own ON video_chunks;
CREATE POLICY video_chunks_select_own ON video_chunks 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM video_jobs 
      WHERE video_jobs.id = video_chunks.job_id 
      AND video_jobs.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS video_chunks_all_service_role ON video_chunks;
CREATE POLICY video_chunks_all_service_role ON video_chunks 
  FOR ALL TO service_role 
  USING (true) WITH CHECK (true);

-- ============================================================================
-- UPDATE get_next_job() TO INCLUDE DEMO TIER PRIORITY
-- ============================================================================
-- Drop existing function first (in case return type changed)
DROP FUNCTION IF EXISTS get_next_job();

CREATE FUNCTION get_next_job()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  generation_id UUID,
  tier TEXT,
  is_first_time BOOLEAN,
  status TEXT,
  user_video_url TEXT,
  master_audio_url TEXT,
  target_images TEXT[],
  prompt TEXT,
  output_url TEXT,
  error_message TEXT,
  sync_offset FLOAT,
  bpm FLOAT,
  chunk_duration FLOAT,
  analysis_status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
) AS $$
DECLARE
  v_job RECORD;
  v_demo_enabled BOOLEAN := true;  -- Can be made configurable via settings table
BEGIN
  -- Priority order:
  -- 1. DEMO tier (if enabled) - highest priority
  -- 2. is_first_time = TRUE
  -- 3. Tier weight (label=4, artist=3, open_mic=2, industry=1)
  -- 4. created_at ASC (FIFO)
  
  SELECT * INTO v_job
  FROM video_jobs
  WHERE video_jobs.status = 'PENDING' OR (video_jobs.status = 'ANALYZED' AND video_jobs.analysis_status = 'ANALYZED')
  ORDER BY
    CASE WHEN v_demo_enabled AND video_jobs.tier = 'demo' THEN 0 ELSE 1 END,  -- DEMO first if enabled
    video_jobs.is_first_time DESC,  -- True (1) comes before False (0)
    CASE video_jobs.tier
      WHEN 'demo' THEN 5  -- Highest weight when enabled
      WHEN 'label' THEN 4
      WHEN 'artist' THEN 3
      WHEN 'open_mic' THEN 2
      WHEN 'industry' THEN 1
      ELSE 0
    END DESC,
    video_jobs.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;  -- Vital for concurrency safety
  
  IF v_job IS NULL THEN
    RETURN;
  END IF;
  
  -- Update status to PROCESSING atomically
  UPDATE video_jobs
  SET status = 'PROCESSING', started_at = NOW(), updated_at = NOW()
  WHERE video_jobs.id = v_job.id;
  
  -- Return the job
  RETURN QUERY
  SELECT
    v_job.id,
    v_job.user_id,
    v_job.generation_id,
    v_job.tier,
    v_job.is_first_time,
    'PROCESSING'::TEXT,  -- Return updated status
    v_job.user_video_url,
    v_job.master_audio_url,
    v_job.target_images,
    v_job.prompt,
    v_job.output_url,
    v_job.error_message,
    v_job.sync_offset,
    v_job.bpm,
    v_job.chunk_duration,
    v_job.analysis_status,
    v_job.created_at,
    NOW(),  -- updated_at
    NOW(),  -- started_at
    v_job.completed_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_next_job() TO service_role;

-- ============================================================================
-- TRIGGER: Auto-dispatch jobs to analyzer (for DEMO/Industry tiers)
-- ============================================================================
-- Note: This requires Supabase Edge Function webhook configuration
-- In Supabase Dashboard: Database → Webhooks → Create webhook
-- URL: https://YOUR_PROJECT.supabase.co/functions/v1/dispatch-job
-- Events: INSERT on video_jobs table
-- HTTP Method: POST
-- 
-- Alternatively, use pg_net extension for HTTP requests from triggers:
-- CREATE EXTENSION IF NOT EXISTS pg_net;
-- Then create a function that calls the edge function via HTTP

-- For now, we'll note that the trigger should be configured in Supabase Dashboard
-- or via a separate migration that sets up pg_net if available
