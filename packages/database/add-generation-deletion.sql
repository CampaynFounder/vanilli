-- ============================================================================
-- ADD DELETION SUPPORT FOR GENERATIONS
-- ============================================================================
-- Allow users to delete unwanted generations (completed, failed, cancelled)
-- This is different from cancellation which only works for pending/processing

-- Function to delete a generation (can be called via RPC)
-- This will be used by the frontend to delete generations
CREATE OR REPLACE FUNCTION delete_generation(generation_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  gen_user_id UUID;
BEGIN
  -- Verify ownership (user must own the generation via project or video_job)
  SELECT COALESCE(p.user_id, vj.user_id) INTO gen_user_id
  FROM generations g
  LEFT JOIN projects p ON g.project_id = p.id
  LEFT JOIN video_jobs vj ON g.id = vj.generation_id
  WHERE g.id = generation_uuid;
  
  -- Check if generation exists
  IF gen_user_id IS NULL THEN
    RAISE EXCEPTION 'Generation not found';
  END IF;
  
  -- Verify ownership
  IF gen_user_id != user_uuid THEN
    RAISE EXCEPTION 'Unauthorized: You can only delete your own generations';
  END IF;
  
  -- Delete related records first (cascading deletes)
  -- Note: video_chunks should have ON DELETE CASCADE, but we'll be explicit
  
  -- Delete video_chunks (if any)
  DELETE FROM video_chunks WHERE generation_id = generation_uuid;
  
  -- Delete video_jobs (if any) - this will cascade to related records
  DELETE FROM video_jobs WHERE generation_id = generation_uuid;
  
  -- Delete the generation itself
  -- This will cascade to projects if project_id is set and ON DELETE CASCADE is configured
  -- But we don't want to delete the project, so we'll just delete the generation
  DELETE FROM generations WHERE id = generation_uuid;
  
  RETURN TRUE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_generation(UUID, UUID) TO authenticated;

-- Note: RLS policies should already allow users to delete their own generations
-- The function uses SECURITY DEFINER to bypass RLS, but checks ownership explicitly
