-- ============================================================================
-- VIDEO PLAYS TABLE (Track video play counts for network effect)
-- ============================================================================
CREATE TABLE IF NOT EXISTS video_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_url TEXT NOT NULL,
  video_id TEXT NOT NULL, -- Identifier for the video (e.g., 'video2', 'video3')
  display_count INTEGER NOT NULL DEFAULT 12347, -- Network effect number (starts at 12347+)
  actual_play_count INTEGER NOT NULL DEFAULT 0, -- Real play count from backend
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for video_plays
CREATE INDEX IF NOT EXISTS idx_video_plays_video_id ON video_plays(video_id);
CREATE INDEX IF NOT EXISTS idx_video_plays_video_url ON video_plays(video_url);
CREATE INDEX IF NOT EXISTS idx_video_plays_created_at ON video_plays(created_at DESC);

-- Unique constraint on video_id to ensure one record per video
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_plays_video_id_unique ON video_plays(video_id);

-- RLS Policy: Allow public reads (for displaying play counts), restrict writes to service role
ALTER TABLE video_plays ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read play counts (for network effect display)
DROP POLICY IF EXISTS video_plays_select_public ON video_plays;
CREATE POLICY video_plays_select_public ON video_plays 
  FOR SELECT 
  TO anon, authenticated, public
  USING (true);

-- Allow service role to insert/update (for tracking plays via API)
DROP POLICY IF EXISTS video_plays_insert_service_role ON video_plays;
CREATE POLICY video_plays_insert_service_role ON video_plays 
  FOR INSERT 
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS video_plays_update_service_role ON video_plays;
CREATE POLICY video_plays_update_service_role ON video_plays 
  FOR UPDATE 
  TO service_role
  USING (true);

-- Initialize play counts for existing videos with 1 standard deviation variation
-- IMPORTANT: When adding new videos, update this INSERT statement!
-- Pattern: Base count = 12347, std dev = ~200
-- Each video should vary by approximately 1 standard deviation from each other
-- Growth rate: 138 plays per hour (calculated dynamically based on time elapsed)
INSERT INTO video_plays (video_id, video_url, display_count, actual_play_count)
VALUES
  ('video2', '/videos/video2.MOV', 12347, 0),  -- Mean (base)
  ('video3', '/videos/video3.MOV', 12547, 0),  -- +200 (+1 std dev)
  ('video4', '/videos/video4.MOV', 12147, 0),  -- -200 (-1 std dev)
  ('video5', '/videos/video5.MOV', 12447, 0),  -- +100 (+0.5 std dev)
  ('video6', '/videos/video6.MOV', 12247, 0),  -- -100 (-0.5 std dev)
  ('video7', '/videos/video7.MOV', 12647, 0)   -- +300 (+1.5 std dev)
  -- Add new videos here with variation around 12347 ± (200 * multiplier)
  -- Example for video8: ('video8', '/videos/video8.MOV', 12347 + (200 * random_multiplier), 0),
ON CONFLICT (video_id) DO NOTHING;

