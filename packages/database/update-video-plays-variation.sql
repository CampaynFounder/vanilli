-- ============================================================================
-- UPDATE EXISTING VIDEO PLAYS WITH 1 STANDARD DEVIATION VARIATION
-- ============================================================================
-- Run this if you already have video_plays records with the old counts
-- This updates them to have realistic variation (1 std dev = 200)

-- Update existing video play counts to have 1 standard deviation variation
-- Base count: 12347, Standard deviation: 200
UPDATE video_plays
SET display_count = CASE video_id
  WHEN 'video2' THEN 12347  -- Mean (base)
  WHEN 'video3' THEN 12547  -- +200 (+1 std dev)
  WHEN 'video4' THEN 12147  -- -200 (-1 std dev)
  WHEN 'video5' THEN 12447  -- +100 (+0.5 std dev)
  WHEN 'video6' THEN 12247  -- -100 (-0.5 std dev)
  WHEN 'video7' THEN 12647  -- +300 (+1.5 std dev)
  ELSE display_count  -- Keep existing for any other videos
END
WHERE video_id IN ('video2', 'video3', 'video4', 'video5', 'video6', 'video7');

-- Verify the updates
SELECT video_id, display_count, actual_play_count, created_at
FROM video_plays
WHERE video_id IN ('video2', 'video3', 'video4', 'video5', 'video6', 'video7')
ORDER BY video_id;

