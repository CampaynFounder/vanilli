-- ============================================================================
-- REFERRAL REWARDS CONFIGURATION TABLE
-- ============================================================================
-- Configurable credit rewards for referrals based on referrer tier and referred product

CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_tier TEXT NOT NULL CHECK (referrer_tier IN ('free', 'open_mic', 'indie_artist', 'artist', 'label')),
  referred_product TEXT NOT NULL CHECK (referred_product IN ('open_mic', 'indie_artist', 'artist', 'label', 'topup')),
  credits_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referrer_tier, referred_product)
);

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
  ('free', 'indie_artist', 20),
  ('free', 'artist', 30),
  ('free', 'label', 50),
  ('free', 'topup', 5),
  
  -- Open Mic tier referrals
  ('open_mic', 'open_mic', 15),
  ('open_mic', 'indie_artist', 25),
  ('open_mic', 'artist', 40),
  ('open_mic', 'label', 60),
  ('open_mic', 'topup', 8),
  
  -- Indie Artist tier referrals
  ('indie_artist', 'open_mic', 20),
  ('indie_artist', 'indie_artist', 30),
  ('indie_artist', 'artist', 50),
  ('indie_artist', 'label', 75),
  ('indie_artist', 'topup', 10),
  
  -- Artist tier referrals
  ('artist', 'open_mic', 25),
  ('artist', 'indie_artist', 40),
  ('artist', 'artist', 60),
  ('artist', 'label', 100),
  ('artist', 'topup', 15),
  
  -- Label tier referrals
  ('label', 'open_mic', 30),
  ('label', 'indie_artist', 50),
  ('label', 'artist', 75),
  ('label', 'label', 150),
  ('label', 'topup', 20)
ON CONFLICT (referrer_tier, referred_product) DO NOTHING;

-- Update referrals table to track product and referrer tier
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referred_product TEXT;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_tier_at_signup TEXT;

-- Verify setup
SELECT * FROM referral_rewards ORDER BY referrer_tier, referred_product;
