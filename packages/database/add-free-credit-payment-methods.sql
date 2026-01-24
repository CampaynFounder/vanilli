-- ============================================================================
-- FREE CREDIT PAYMENT METHODS
-- ============================================================================
-- Ensures a payment method can only be used once for free credits (prevents
-- gaming: same card across accounts). Uses Stripe card.fingerprint when
-- available, else payment_method id. Run after schema.sql.

-- Table: one row per payment method that has received a free-credit grant.
-- Unique on payment_method_identifier (card fingerprint or pm_xxx for non-card).
CREATE TABLE IF NOT EXISTS free_credit_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method_identifier TEXT NOT NULL,
  stripe_payment_method_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits_granted INTEGER NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_free_credit_pm_identifier
  ON free_credit_payment_methods(payment_method_identifier);

CREATE INDEX IF NOT EXISTS idx_free_credit_pm_user
  ON free_credit_payment_methods(user_id);

-- RLS: only service role / SECURITY DEFINER can insert. No user read needed.
ALTER TABLE free_credit_payment_methods ENABLE ROW LEVEL SECURITY;

-- No policies: anon/authenticated cannot read or write. The grant RPC runs
-- as SECURITY DEFINER and bypasses RLS.

-- RPC: atomically check uniqueness, insert, add credits, set free_generation_redeemed.
-- Returns 'ok' or 'already_used'. Called by stripe-webhook on setup_intent.succeeded.
CREATE OR REPLACE FUNCTION grant_free_credits_for_payment_method(
  p_user_id UUID,
  p_credits INTEGER,
  p_payment_method_identifier TEXT,
  p_stripe_pm_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  BEGIN
    INSERT INTO free_credit_payment_methods (
      payment_method_identifier,
      stripe_payment_method_id,
      user_id,
      credits_granted
    ) VALUES (
      p_payment_method_identifier,
      p_stripe_pm_id,
      p_user_id,
      p_credits
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN 'already_used';
  END;

  PERFORM add_credits(p_user_id, p_credits);
  UPDATE users SET free_generation_redeemed = true WHERE id = p_user_id;
  RETURN 'ok';
END;
$$;
