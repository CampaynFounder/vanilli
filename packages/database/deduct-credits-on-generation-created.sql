-- ============================================================================
-- DEDUCT CREDITS WHEN GENERATION IS CREATED (NOT ON COMPLETION)
-- ============================================================================
-- When a generation is created with status='pending' and cost_credits > 0,
-- immediately deduct credits from the user. This ensures users are charged
-- as soon as the request is generated, not when it completes.
--
-- Features:
-- - Idempotent: Checks credits_deducted flag to prevent double-charging
-- - Activity Logging: Logs all credit transactions to audit_log
-- - Multi-tier Support: Handles both projects (legacy) and video_jobs (demo/industry)
-- - Always Retrieves: Ensures we always get the request and subtract credits
--
-- Run after schema.sql. Requires:
-- - deduct_credits(p_user_id, p_credits) function
-- - log_user_action() function
-- - generations.credits_deducted column (added in this migration)

-- Add credits_deducted flag to prevent double-charging
ALTER TABLE generations ADD COLUMN IF NOT EXISTS credits_deducted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS credits_deducted_at TIMESTAMPTZ;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_generations_credits_deducted ON generations(credits_deducted) WHERE credits_deducted = false;

-- Function to deduct credits when generation is created
CREATE OR REPLACE FUNCTION on_generation_created_deduct_credits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_deduction_successful BOOLEAN;
  v_credits_before INTEGER;
  v_credits_after INTEGER;
  v_metadata JSONB;
  v_log_id UUID;
BEGIN
  -- Only process if:
  -- 1. Status is 'pending' (newly created generation)
  -- 2. cost_credits > 0 (has a cost)
  -- 3. credits_deducted = false (not already deducted)
  IF NEW.status = 'pending' AND NEW.cost_credits > 0 AND (NEW.credits_deducted IS NULL OR NEW.credits_deducted = false) THEN
    
    -- Get user_id from either project (legacy) or video_jobs (demo/industry)
    SELECT COALESCE(
      (SELECT user_id FROM projects WHERE id = NEW.project_id),
      (SELECT user_id FROM video_jobs WHERE generation_id = NEW.id)
    ) INTO v_user_id;
    
    -- If user_id found, deduct credits
    IF v_user_id IS NOT NULL THEN
      -- Get current credits balance before deduction
      SELECT credits_remaining INTO v_credits_before
      FROM users
      WHERE id = v_user_id;
      
      -- Attempt to deduct credits (atomic operation with balance check)
      SELECT deduct_credits(v_user_id, NEW.cost_credits) INTO v_deduction_successful;
      
      IF v_deduction_successful THEN
        -- Get credits balance after deduction
        SELECT credits_remaining INTO v_credits_after
        FROM users
        WHERE id = v_user_id;
        
        -- Mark credits as deducted
        NEW.credits_deducted := true;
        NEW.credits_deducted_at := NOW();
        
        -- Prepare metadata for activity log
        v_metadata := jsonb_build_object(
          'generation_id', NEW.id,
          'credits_deducted', NEW.cost_credits,
          'credits_before', v_credits_before,
          'credits_after', v_credits_after,
          'tier', (SELECT tier FROM users WHERE id = v_user_id),
          'status', NEW.status,
          'trigger', 'generation_created'
        );
        
        -- Log to activity log (audit_log)
        SELECT log_user_action(
          v_user_id,
          'credits_deducted',
          'generation',
          NEW.id,
          v_metadata
        ) INTO v_log_id;
        
        RAISE NOTICE 'Credits deducted: user_id=%, generation_id=%, credits=%, log_id=%', 
          v_user_id, NEW.id, NEW.cost_credits, v_log_id;
      ELSE
        -- Insufficient credits - log as failed attempt
        v_metadata := jsonb_build_object(
          'generation_id', NEW.id,
          'credits_attempted', NEW.cost_credits,
          'credits_available', v_credits_before,
          'status', 'insufficient_credits',
          'trigger', 'generation_created'
        );
        
        SELECT log_user_action(
          v_user_id,
          'credits_deduction_failed',
          'generation',
          NEW.id,
          v_metadata
        ) INTO v_log_id;
        
        RAISE WARNING 'Insufficient credits: user_id=%, generation_id=%, required=%, available=%', 
          v_user_id, NEW.id, NEW.cost_credits, v_credits_before;
      END IF;
    ELSE
      RAISE WARNING 'No user_id found for generation_id=% (project_id=%)', NEW.id, NEW.project_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop old trigger if exists (for generation completion)
DROP TRIGGER IF EXISTS trg_generation_completed_deduct_credits ON generations;

-- Create new trigger for generation creation
DROP TRIGGER IF EXISTS trg_generation_created_deduct_credits ON generations;
CREATE TRIGGER trg_generation_created_deduct_credits
  BEFORE INSERT OR UPDATE ON generations
  FOR EACH ROW
  EXECUTE FUNCTION on_generation_created_deduct_credits();

-- Function to manually retry credit deduction for existing generations
-- This ensures we ALWAYS retrieve the request and subtract credits
-- Can be called if a generation was created but credits weren't deducted
CREATE OR REPLACE FUNCTION retry_credit_deduction(p_generation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_generation RECORD;
  v_user_id UUID;
  v_deduction_successful BOOLEAN;
  v_credits_before INTEGER;
  v_credits_after INTEGER;
  v_metadata JSONB;
  v_log_id UUID;
BEGIN
  -- Get generation details
  SELECT * INTO v_generation
  FROM generations
  WHERE id = p_generation_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Generation not found: %', p_generation_id;
  END IF;
  
  -- Skip if already deducted
  IF v_generation.credits_deducted = true THEN
    RAISE NOTICE 'Credits already deducted for generation_id=%', p_generation_id;
    RETURN true;
  END IF;
  
  -- Skip if no cost
  IF v_generation.cost_credits IS NULL OR v_generation.cost_credits <= 0 THEN
    RAISE NOTICE 'No credits to deduct for generation_id=%', p_generation_id;
    RETURN true;
  END IF;
  
  -- Get user_id
  SELECT COALESCE(
    (SELECT user_id FROM projects WHERE id = v_generation.project_id),
    (SELECT user_id FROM video_jobs WHERE generation_id = v_generation.id)
  ) INTO v_user_id;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No user_id found for generation_id=%', p_generation_id;
  END IF;
  
  -- Get current credits
  SELECT credits_remaining INTO v_credits_before
  FROM users
  WHERE id = v_user_id;
  
  -- Deduct credits
  SELECT deduct_credits(v_user_id, v_generation.cost_credits) INTO v_deduction_successful;
  
  IF v_deduction_successful THEN
    -- Get credits after
    SELECT credits_remaining INTO v_credits_after
    FROM users
    WHERE id = v_user_id;
    
    -- Update generation
    UPDATE generations
    SET 
      credits_deducted = true,
      credits_deducted_at = NOW()
    WHERE id = p_generation_id;
    
    -- Log activity
    v_metadata := jsonb_build_object(
      'generation_id', p_generation_id,
      'credits_deducted', v_generation.cost_credits,
      'credits_before', v_credits_before,
      'credits_after', v_credits_after,
      'tier', (SELECT tier FROM users WHERE id = v_user_id),
      'status', v_generation.status,
      'trigger', 'manual_retry'
    );
    
    SELECT log_user_action(
      v_user_id,
      'credits_deducted',
      'generation',
      p_generation_id,
      v_metadata
    ) INTO v_log_id;
    
    RETURN true;
  ELSE
    -- Log failed attempt
    v_metadata := jsonb_build_object(
      'generation_id', p_generation_id,
      'credits_attempted', v_generation.cost_credits,
      'credits_available', v_credits_before,
      'status', 'insufficient_credits',
      'trigger', 'manual_retry'
    );
    
    SELECT log_user_action(
      v_user_id,
      'credits_deduction_failed',
      'generation',
      p_generation_id,
      v_metadata
    ) INTO v_log_id;
    
    RETURN false;
  END IF;
END;
$$;

-- Add comments
COMMENT ON COLUMN generations.credits_deducted IS 'Flag indicating if credits have been deducted for this generation';
COMMENT ON COLUMN generations.credits_deducted_at IS 'Timestamp when credits were deducted';
COMMENT ON FUNCTION on_generation_created_deduct_credits() IS 'Trigger function that deducts credits when generation is created (status=pending)';
COMMENT ON FUNCTION retry_credit_deduction(UUID) IS 'Manually retry credit deduction for a generation that may have been missed';
