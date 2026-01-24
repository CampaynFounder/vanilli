-- ============================================================================
-- DEDUCT CREDITS WHEN GENERATION COMPLETES
-- ============================================================================
-- When generations.status is set to 'completed', deduct cost_credits from the
-- project owner. Run after schema.sql. Requires deduct_credits(p_user_id, p_credits).

CREATE OR REPLACE FUNCTION on_generation_completed_deduct_credits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status IS DISTINCT FROM 'completed') AND NEW.cost_credits > 0 THEN
    SELECT user_id INTO v_user_id FROM projects WHERE id = NEW.project_id;
    IF v_user_id IS NOT NULL THEN
      PERFORM deduct_credits(v_user_id, NEW.cost_credits);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generation_completed_deduct_credits ON generations;
CREATE TRIGGER trg_generation_completed_deduct_credits
  AFTER UPDATE ON generations
  FOR EACH ROW
  EXECUTE FUNCTION on_generation_completed_deduct_credits();
