-- ============================================================================
-- BILLING_PROFILES TABLE AND has_valid_card ON USERS
-- ============================================================================
-- billing_profiles: stores linked payment methods (card, Cash App, etc.) per user.
-- has_valid_card: gates site usage; users must link a payment method before using
-- Studio, History, or purchasing credits. Set by register-user when a PM is linked.
-- Run after schema.sql. (add-user-payment-method-display.sql is optional; backfill uses only stripe_customer_id.)

-- Add has_valid_card to users (default false; backfill existing users who already have a Stripe customer)
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_valid_card BOOLEAN NOT NULL DEFAULT false;

UPDATE users
SET has_valid_card = true
WHERE has_valid_card = false
  AND stripe_customer_id IS NOT NULL;

-- Table: one row per (user, stripe_payment_method_id). Supports cards, Cash App, etc.
CREATE TABLE IF NOT EXISTS billing_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_payment_method_id TEXT NOT NULL,
  card_fingerprint TEXT,
  card_last4 TEXT,
  card_brand TEXT,
  payment_method_type TEXT,
  has_valid_card BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, stripe_payment_method_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_profiles_user ON billing_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_profiles_fingerprint ON billing_profiles(card_fingerprint) WHERE card_fingerprint IS NOT NULL;

ALTER TABLE billing_profiles ENABLE ROW LEVEL SECURITY;

-- Only service role / backend writes. Users don't need to read billing_profiles directly
-- (we use users.has_valid_card and users.payment_method_last4/brand for display).
DROP POLICY IF EXISTS billing_profiles_select_own ON billing_profiles;
CREATE POLICY billing_profiles_select_own ON billing_profiles FOR SELECT USING (auth.uid() = user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_billing_profiles_updated_at ON billing_profiles;
CREATE TRIGGER update_billing_profiles_updated_at
  BEFORE UPDATE ON billing_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
