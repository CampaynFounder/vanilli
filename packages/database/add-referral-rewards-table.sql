-- ============================================================================
-- REFERRAL REWARDS CONFIGURATION TABLE
-- ============================================================================
-- Configurable credit rewards for referrals based on referrer tier and referred product

CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_tier TEXT NOT NULL,
  referred_product TEXT NOT NULL,
  credits_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referrer_tier, referred_product)
);

-- Drop and recreate constraints to ensure they're up to date (allows 'topup')
ALTER TABLE referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_referrer_tier_check;
ALTER TABLE referral_rewards DROP CONSTRAINT IF EXISTS referral_rewards_referred_product_check;
ALTER TABLE referral_rewards ADD CONSTRAINT referral_rewards_referrer_tier_check 
  CHECK (referrer_tier IN ('free', 'open_mic', 'artist', 'label', 'industry', 'demo'));
ALTER TABLE referral_rewards ADD CONSTRAINT referral_rewards_referred_product_check 
  CHECK (referred_product IN ('open_mic', 'artist', 'label', 'industry', 'topup'));

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer_tier ON referral_rewards(referrer_tier);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referred_product ON referral_rewards(referred_product);

-- RLS Policy: Allow authenticated users to read (for showing reward amounts)
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_rewards_select_authenticated ON referral_rewards;
CREATE POLICY referral_rewards_select_authenticated ON referral_rewards 
  FOR SELECT 
  TO authenticated
  USING (true);

-- Only service role can insert/update (for admin configuration)
DROP POLICY IF EXISTS referral_rewards_insert_service_role ON referral_rewards;
CREATE POLICY referral_rewards_insert_service_role ON referral_rewards 
  FOR INSERT 
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS referral_rewards_update_service_role ON referral_rewards;
CREATE POLICY referral_rewards_update_service_role ON referral_rewards 
  FOR UPDATE 
  TO service_role
  USING (true);

-- Initialize default reward amounts
-- Format: (referrer_tier, referred_product, credits_awarded)
-- Higher tiers get more rewards for referring premium users
INSERT INTO referral_rewards (referrer_tier, referred_product, credits_awarded)
VALUES
  -- Free tier referrals
  ('free', 'open_mic', 10),
  ('free', 'artist', 30),
  ('free', 'label', 50),
  ('free', 'industry', 100),
  ('free', 'topup', 5),
  
  -- Open Mic tier referrals
  ('open_mic', 'open_mic', 15),
  ('open_mic', 'artist', 40),
  ('open_mic', 'label', 60),
  ('open_mic', 'industry', 120),
  ('open_mic', 'topup', 8),
  
  -- Artist tier referrals
  ('artist', 'open_mic', 25),
  ('artist', 'artist', 60),
  ('artist', 'label', 100),
  ('artist', 'industry', 150),
  ('artist', 'topup', 15),
  
  -- Label tier referrals
  ('label', 'open_mic', 30),
  ('label', 'artist', 75),
  ('label', 'label', 150),
  ('label', 'industry', 200),
  ('label', 'topup', 20),
  
  -- Industry tier referrals
  ('industry', 'open_mic', 40),
  ('industry', 'artist', 80),
  ('industry', 'label', 120),
  ('industry', 'industry', 250),
  ('industry', 'topup', 25)
ON CONFLICT (referrer_tier, referred_product) DO NOTHING;

-- Update referrals table to track product and referrer tier
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referred_product TEXT;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_tier_at_signup TEXT;

-- Allow authenticated users to create their own referral code row
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referrals_insert_own ON referrals;
CREATE POLICY referrals_insert_own ON referrals
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = referrer_user_id
    AND referred_user_id IS NULL
    AND status = 'pending'
    AND credits_awarded = 0
  );

-- Verify setup
SELECT * FROM referral_rewards ORDER BY referrer_tier, referred_product;
