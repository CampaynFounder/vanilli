-- ============================================================================
-- VIDEO JOBS TABLE (Queue management for tier-based processing)
-- ============================================================================
-- Stores video generation jobs with tier, priority, and status

CREATE TABLE IF NOT EXISTS video_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES generations(id) ON DELETE SET NULL,
  tier TEXT NOT NULL CHECK (tier IN ('open_mic', 'artist', 'label', 'industry')),
  is_first_time BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  user_video_url TEXT NOT NULL,
  master_audio_url TEXT NOT NULL,
  target_images TEXT[] NOT NULL, -- Array of image URLs
  prompt TEXT,
  output_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes for queue queries
CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON video_jobs(status);
CREATE INDEX IF NOT EXISTS idx_video_jobs_tier ON video_jobs(tier);
CREATE INDEX IF NOT EXISTS idx_video_jobs_first_time ON video_jobs(is_first_time);
CREATE INDEX IF NOT EXISTS idx_video_jobs_created_at ON video_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_video_jobs_user_id ON video_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_video_jobs_generation_id ON video_jobs(generation_id);

-- Composite index for priority query
CREATE INDEX IF NOT EXISTS idx_video_jobs_priority ON video_jobs(status, is_first_time DESC, tier, created_at);

-- RLS Policies
ALTER TABLE video_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_jobs_select_own ON video_jobs;
CREATE POLICY video_jobs_select_own ON video_jobs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS video_jobs_insert_own ON video_jobs;
CREATE POLICY video_jobs_insert_own ON video_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role can manage all jobs
DROP POLICY IF EXISTS video_jobs_all_service_role ON video_jobs;
CREATE POLICY video_jobs_all_service_role ON video_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- RPC FUNCTION: get_next_job (Priority queue with FOR UPDATE SKIP LOCKED)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_next_job()
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
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
) AS $$
DECLARE
  v_job RECORD;
BEGIN
  -- Priority order:
  -- 1. is_first_time = TRUE (highest)
  -- 2. Tier weight (label=4, artist=3, open_mic=2, industry=1)
  -- 3. created_at ASC (FIFO)
  
  SELECT * INTO v_job
  FROM video_jobs
  WHERE status = 'PENDING'
  ORDER BY
    is_first_time DESC,  -- True (1) comes before False (0)
    CASE tier
      WHEN 'label' THEN 4
      WHEN 'artist' THEN 3
      WHEN 'open_mic' THEN 2
      WHEN 'industry' THEN 1
    END DESC,
    created_at ASC
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
    v_job.created_at,
    NOW(),  -- updated_at
    NOW(),  -- started_at
    v_job.completed_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_next_job() TO service_role;

-- ============================================================================
-- TRIGGER: Update updated_at timestamp
-- ============================================================================
DROP TRIGGER IF EXISTS update_video_jobs_updated_at ON video_jobs;
CREATE TRIGGER update_video_jobs_updated_at
  BEFORE UPDATE ON video_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
