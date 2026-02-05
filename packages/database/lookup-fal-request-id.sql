-- Look up Fal AI request_id 8b839eb1-715c-4049-84c3-ce6b2b1e5e1c
-- Run in Supabase SQL Editor (Dashboard → SQL Editor). Uses service role / full access.

-- 1) As fal_request_id on a chunk (how the webhook finds the chunk)
SELECT 'video_chunks by fal_request_id' AS lookup,
       vc.id AS chunk_id,
       vc.job_id,
       vc.generation_id,
       vc.chunk_index,
       vc.status,
       vc.fal_request_id,
       vc.video_url,
       vc.kling_video_url,
       vc.created_at,
       vc.completed_at
FROM video_chunks vc
WHERE vc.fal_request_id = '8b839eb1-715c-4049-84c3-ce6b2b1e5e1c';

-- 2) As chunk id
SELECT 'video_chunks by id' AS lookup,
       vc.id, vc.job_id, vc.generation_id, vc.chunk_index, vc.status,
       vc.fal_request_id, vc.video_url, vc.created_at
FROM video_chunks vc
WHERE vc.id = '8b839eb1-715c-4049-84c3-ce6b2b1e5e1c';

-- 3) As job id
SELECT 'video_jobs by id' AS lookup,
       vj.id, vj.user_id, vj.generation_id, vj.status, vj.output_url,
       vj.created_at, vj.completed_at
FROM video_jobs vj
WHERE vj.id = '8b839eb1-715c-4049-84c3-ce6b2b1e5e1c';

-- 4) As generation id
SELECT 'generations by id' AS lookup,
       g.id, g.project_id, g.status, g.created_at
FROM generations g
WHERE g.id = '8b839eb1-715c-4049-84c3-ce6b2b1e5e1c';

-- 5) Any chunk with this ID in fal_request_id (case-insensitive / partial)
SELECT 'video_chunks fal_request_id contains' AS lookup,
       vc.id, vc.job_id, vc.chunk_index, vc.status, vc.fal_request_id
FROM video_chunks vc
WHERE vc.fal_request_id::text ILIKE '%8b839eb1%';

-- =============================================================================
-- FIX: Chunk is stuck in PROCESSING (webhook never updated it).
-- 1) In Fal dashboard, open request 8b839eb1-715c-4049-84c3-ce6b2b1e5e1c and
--    copy the output video URL (e.g. https://v3b.fal.media/files/.../output.mp4).
-- 2) Replace the placeholder below with that URL and run the UPDATE.
-- 3) If this job has only one chunk (chunk_index 0), also complete the job and
--    generation so the UI shows the video (run the two updates in the next block).
-- =============================================================================

-- Mark chunk COMPLETED with Fal output URL (replace <FAL_OUTPUT_VIDEO_URL> with real URL)
/*
UPDATE video_chunks
SET status = 'COMPLETED',
    kling_video_url = '<FAL_OUTPUT_VIDEO_URL>',
    video_url = '<FAL_OUTPUT_VIDEO_URL>',
    completed_at = NOW()
WHERE fal_request_id = '8b839eb1-715c-4049-84c3-ce6b2b1e5e1c';
*/

-- After chunk update: complete the job and generation so the UI shows the video
-- (Only run if this job has a single chunk; job_id from your result: 73601c0b-14b7-4d42-ae21-de29dfd86ea3)
/*
UPDATE video_jobs
SET status = 'COMPLETED',
    output_url = (SELECT video_url FROM video_chunks WHERE job_id = '73601c0b-14b7-4d42-ae21-de29dfd86ea3' LIMIT 1),
    completed_at = NOW()
WHERE id = '73601c0b-14b7-4d42-ae21-de29dfd86ea3';

UPDATE generations
SET status = 'completed'
WHERE id = (SELECT generation_id FROM video_chunks WHERE job_id = '73601c0b-14b7-4d42-ae21-de29dfd86ea3' LIMIT 1);
*/
