-- ============================================================================
-- CHUNK OBSERVABILITY VIEWS
-- ============================================================================
-- Helper views for easy querying of chunk observability data
-- These views make it easy to validate chunk synchronization and ordering

-- View: Complete chunk observability with all details
CREATE OR REPLACE VIEW chunk_observability AS
SELECT 
    vc.id AS chunk_id,
    vc.job_id,
    vc.generation_id,
    vc.chunk_index,
    vc.status,
    
    -- Image information
    vc.image_url,
    vc.image_index,
    
    -- Video chunk information
    vc.video_chunk_url,
    vc.video_chunk_start_time,
    vc.chunk_duration,
    vc.video_chunk_start_time + vc.chunk_duration AS video_chunk_end_time,
    
    -- Audio synchronization information
    vc.audio_start_time,
    vc.sync_offset,
    vc.audio_start_time + vc.chunk_duration AS audio_end_time,
    
    -- Kling API information
    vc.kling_task_id,
    vc.kling_requested_at,
    vc.kling_completed_at,
    CASE 
        WHEN vc.kling_requested_at IS NOT NULL AND vc.kling_completed_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (vc.kling_completed_at - vc.kling_requested_at))
        ELSE NULL
    END AS kling_processing_seconds,
    vc.kling_video_url,
    
    -- Output information
    vc.video_url AS final_chunk_url,
    vc.credits_charged,
    vc.error_message,
    
    -- Timestamps
    vc.created_at,
    vc.completed_at,
    
    -- Generation metadata (if available)
    vj.user_id,
    g.status AS generation_status,
    
    -- Validation flags
    CASE 
        WHEN vc.image_index IS NOT NULL AND vc.chunk_index IS NOT NULL 
        THEN vc.image_index = (vc.chunk_index % (SELECT COUNT(*) FROM unnest(vj.target_images) AS img))
        ELSE NULL
    END AS image_index_matches_rotation,
    
    CASE 
        WHEN vc.audio_start_time IS NOT NULL AND vc.video_chunk_start_time IS NOT NULL AND vc.sync_offset IS NOT NULL
        THEN ABS(vc.audio_start_time - (vc.video_chunk_start_time + vc.sync_offset)) < 0.001
        ELSE NULL
    END AS audio_video_sync_valid

FROM video_chunks vc
LEFT JOIN video_jobs vj ON vc.job_id = vj.id
LEFT JOIN generations g ON vc.generation_id = g.id;

-- View: Chunk synchronization summary (for validation)
CREATE OR REPLACE VIEW chunk_sync_summary AS
SELECT 
    generation_id,
    job_id,
    COUNT(*) AS total_chunks,
    COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_chunks,
    COUNT(*) FILTER (WHERE status = 'FAILED') AS failed_chunks,
    
    -- Image rotation validation
    COUNT(DISTINCT image_index) AS unique_images_used,
    MIN(image_index) AS min_image_index,
    MAX(image_index) AS max_image_index,
    
    -- Timing validation
    MIN(video_chunk_start_time) AS first_video_start,
    MAX(video_chunk_start_time + chunk_duration) AS last_video_end,
    MIN(audio_start_time) AS first_audio_start,
    MAX(audio_start_time + chunk_duration) AS last_audio_end,
    
    -- Sync offset consistency
    COUNT(DISTINCT sync_offset) AS unique_sync_offsets,
    MIN(sync_offset) AS min_sync_offset,
    MAX(sync_offset) AS max_sync_offset,
    
    -- Kling processing stats
    AVG(kling_processing_seconds) AS avg_kling_seconds,
    MIN(kling_processing_seconds) AS min_kling_seconds,
    MAX(kling_processing_seconds) AS max_kling_seconds,
    
    -- Validation flags
    COUNT(*) FILTER (WHERE image_index_matches_rotation = true) AS valid_image_rotations,
    COUNT(*) FILTER (WHERE audio_video_sync_valid = true) AS valid_syncs

FROM chunk_observability
GROUP BY generation_id, job_id;

-- Grant access to service role
GRANT SELECT ON chunk_observability TO service_role;
GRANT SELECT ON chunk_sync_summary TO service_role;

-- Add comments
COMMENT ON VIEW chunk_observability IS 'Complete observability view showing all chunk details including image, video, audio timing, and Kling API information';
COMMENT ON VIEW chunk_sync_summary IS 'Summary view for validating chunk synchronization across a generation';
