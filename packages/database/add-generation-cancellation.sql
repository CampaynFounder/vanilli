-- ============================================================================
-- ADD CANCELLATION SUPPORT TO GENERATIONS TABLE
-- ============================================================================
-- Allow users to cancel generations that are taking too long or stuck

-- Update status CHECK constraint to include 'cancelled'
ALTER TABLE generations DROP CONSTRAINT IF EXISTS generations_status_check;
ALTER TABLE generations ADD CONSTRAINT generations_status_check 
  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

-- Add cancelled_at timestamp
ALTER TABLE generations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Add cancelled_by (user_id who cancelled it)
ALTER TABLE generations ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id);

-- Create index for querying cancelled generations
CREATE INDEX IF NOT EXISTS idx_generations_cancelled ON generations(cancelled_at) 
  WHERE status = 'cancelled';

-- Function to cancel a generation (can be called via RPC or direct update)
-- This will be used by the frontend to cancel generations
CREATE OR REPLACE FUNCTION cancel_generation(generation_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  gen_status TEXT;
  gen_project_id UUID;
  gen_cost_credits INTEGER;
  gen_user_id UUID;
BEGIN
  -- Get current status, cost, and verify ownership
  SELECT g.status, g.project_id, g.cost_credits, COALESCE(p.user_id, vj.user_id) INTO gen_status, gen_project_id, gen_cost_credits, gen_user_id
  FROM generations g
  LEFT JOIN projects p ON g.project_id = p.id
  LEFT JOIN video_jobs vj ON g.id = vj.generation_id
  WHERE g.id = generation_uuid;
  
  -- Check if generation exists
  IF gen_status IS NULL THEN
    RAISE EXCEPTION 'Generation not found';
  END IF;
  
  -- Verify ownership (user must own the generation via project or video_job)
  IF gen_user_id IS NULL OR gen_user_id != user_uuid THEN
    RAISE EXCEPTION 'Unauthorized: You can only cancel your own generations';
  END IF;
  
  -- Only allow cancellation if pending or processing
  IF gen_status NOT IN ('pending', 'processing') THEN
    RAISE EXCEPTION 'Generation cannot be cancelled (status: %)', gen_status;
  END IF;
  
  -- Update generation to cancelled
  UPDATE generations
  SET 
    status = 'cancelled',
    cancelled_at = NOW(),
    cancelled_by = user_uuid,
    current_stage = 'cancelled',
    progress_percentage = 0,
    estimated_completion_at = NULL
  WHERE id = generation_uuid;
  
  -- Refund credits if generation was processing (not yet completed)
  -- Credits are only deducted on completion, so we only need to refund if they were pre-deducted
  -- For now, we'll just mark it as cancelled - credits are deducted on completion, not start
  -- So no refund needed for pending/processing generations
  
  -- Update related video_job if exists
  UPDATE video_jobs
  SET status = 'FAILED',
      error_message = 'Cancelled by user'
  WHERE generation_id = generation_uuid
    AND status IN ('PENDING', 'PENDING_ANALYSIS', 'ANALYZED', 'PROCESSING');
  
  -- Update related project status if exists
  IF gen_project_id IS NOT NULL THEN
    UPDATE projects
    SET status = 'failed'
    WHERE id = gen_project_id;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION cancel_generation(UUID, UUID) TO authenticated;

-- RLS: Users can only cancel their own generations
-- This is handled by checking project ownership in the function
-- But we should also ensure RLS allows the update
-- The function uses SECURITY DEFINER so it can update, but we check ownership via projects
