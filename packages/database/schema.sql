-- Vannilli Database Schema
-- PostgreSQL 15+ (Supabase)
-- Version: 1.0
-- Last Updated: January 22, 2026
--
-- Idempotent: safe to re-run. Uses CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- DROP POLICY IF EXISTS, and DROP TRIGGER IF EXISTS to avoid "relation already exists" errors.
-- For additional columns (e.g. avatar_url), run packages/database/add-user-avatar.sql.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE (skip if public.users already exists to avoid 42P07)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      stripe_customer_id TEXT UNIQUE,
      tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'open_mic', 'artist', 'label', 'industry', 'demo')),
      credits_remaining INTEGER NOT NULL DEFAULT 0,
      free_generation_redeemed BOOLEAN NOT NULL DEFAULT false,
      device_fingerprint TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_device_fingerprint ON users(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);

-- User profile fields (idempotent for existing installs)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
CREATE INDEX IF NOT EXISTS idx_users_avatar_url ON users(avatar_url) WHERE avatar_url IS NOT NULL;

-- ============================================================================
-- PROJECTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_name TEXT NOT NULL,
  bpm INTEGER NOT NULL CHECK (bpm >= 60 AND bpm <= 200),
  bars INTEGER NOT NULL CHECK (bars >= 1 AND bars <= 32),
  duration_seconds INTEGER NOT NULL,
  audio_r2_path TEXT,
  target_image_r2_path TEXT NOT NULL,
  driver_video_r2_path TEXT NOT NULL,
  prompt TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for projects
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);

-- ============================================================================
-- GENERATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  internal_task_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  kling_task_id TEXT UNIQUE,
  cost_credits INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  final_video_r2_path TEXT,
  preview_gif_r2_path TEXT,
  thumbnail_r2_path TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes for generations
CREATE INDEX IF NOT EXISTS idx_generations_project_id ON generations(project_id);
CREATE INDEX IF NOT EXISTS idx_generations_internal_task_id ON generations(internal_task_id);
CREATE INDEX IF NOT EXISTS idx_generations_kling_task_id ON generations(kling_task_id);
CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);

-- ============================================================================
-- SUBSCRIPTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('open_mic', 'artist', 'label', 'industry', 'demo')),
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'paused')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ============================================================================
-- AUDIT LOG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- ============================================================================
-- REFERRALS TABLE (for viral growth)
-- ============================================================================
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL UNIQUE,
  credits_awarded INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes for referrals
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

-- Additional referral metadata
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referred_product TEXT;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS referrer_tier_at_signup TEXT;

-- ============================================================================
-- REFERRAL REWARDS (configurable credit rewards per tier/product)
-- ============================================================================
CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_tier TEXT NOT NULL CHECK (referrer_tier IN ('free', 'open_mic', 'artist', 'label', 'industry', 'demo')),
  referred_product TEXT NOT NULL CHECK (referred_product IN ('open_mic', 'artist', 'label', 'industry', 'topup')),
  credits_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referrer_tier, referred_product)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer_tier ON referral_rewards(referrer_tier);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referred_product ON referral_rewards(referred_product);

-- ============================================================================
-- CONTENT REPORTS TABLE (for moderation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reported_generation_id UUID REFERENCES generations(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('copyright', 'inappropriate', 'spam', 'other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Indexes for content_reports
CREATE INDEX IF NOT EXISTS idx_content_reports_generation ON content_reports(reported_generation_id);
CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status);
CREATE INDEX IF NOT EXISTS idx_content_reports_created_at ON content_reports(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables (idempotent: no-op if already enabled)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

-- Users: Can only read/update their own data
DROP POLICY IF EXISTS users_select_own ON users;
CREATE POLICY users_select_own ON users FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS users_update_own ON users;
CREATE POLICY users_update_own ON users FOR UPDATE USING (auth.uid() = id);

-- Projects: Users can only access their own projects
DROP POLICY IF EXISTS projects_select_own ON projects;
CREATE POLICY projects_select_own ON projects FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS projects_insert_own ON projects;
CREATE POLICY projects_insert_own ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS projects_update_own ON projects;
CREATE POLICY projects_update_own ON projects FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS projects_delete_own ON projects;
CREATE POLICY projects_delete_own ON projects FOR DELETE USING (auth.uid() = user_id);

-- Generations: Users can only access generations for their projects
DROP POLICY IF EXISTS generations_select_own ON generations;
CREATE POLICY generations_select_own ON generations FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = generations.project_id AND projects.user_id = auth.uid()));
DROP POLICY IF EXISTS generations_insert_own ON generations;
CREATE POLICY generations_insert_own ON generations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM projects WHERE projects.id = generations.project_id AND projects.user_id = auth.uid()));

-- Subscriptions: Users can only see their own subscriptions
DROP POLICY IF EXISTS subscriptions_select_own ON subscriptions;
CREATE POLICY subscriptions_select_own ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Audit Log: Users can only see their own audit logs
DROP POLICY IF EXISTS audit_log_select_own ON audit_log;
CREATE POLICY audit_log_select_own ON audit_log FOR SELECT USING (auth.uid() = user_id);

-- Referrals: Users can see referrals they made or received
DROP POLICY IF EXISTS referrals_select_own ON referrals;
CREATE POLICY referrals_select_own ON referrals FOR SELECT
  USING (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id);
DROP POLICY IF EXISTS referrals_insert_own ON referrals;
CREATE POLICY referrals_insert_own ON referrals FOR INSERT
  WITH CHECK (
    auth.uid() = referrer_user_id
    AND referred_user_id IS NULL
    AND status = 'pending'
    AND credits_awarded = 0
  );

-- Referral rewards: Authenticated read, service-role manage
DROP POLICY IF EXISTS referral_rewards_select_authenticated ON referral_rewards;
CREATE POLICY referral_rewards_select_authenticated ON referral_rewards FOR SELECT
  TO authenticated
  USING (true);
DROP POLICY IF EXISTS referral_rewards_insert_service_role ON referral_rewards;
CREATE POLICY referral_rewards_insert_service_role ON referral_rewards FOR INSERT
  TO service_role
  WITH CHECK (true);
DROP POLICY IF EXISTS referral_rewards_update_service_role ON referral_rewards;
CREATE POLICY referral_rewards_update_service_role ON referral_rewards FOR UPDATE
  TO service_role
  USING (true);

-- Content Reports: Users can insert reports and see their own
DROP POLICY IF EXISTS content_reports_select_own ON content_reports;
CREATE POLICY content_reports_select_own ON content_reports FOR SELECT USING (auth.uid() = reporter_user_id);
DROP POLICY IF EXISTS content_reports_insert ON content_reports;
CREATE POLICY content_reports_insert ON content_reports FOR INSERT WITH CHECK (auth.uid() = reporter_user_id);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at (DROP IF EXISTS allows re-run)
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to log user actions
CREATE OR REPLACE FUNCTION log_user_action(
  p_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT,
  p_resource_id UUID,
  p_metadata JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_log (
    user_id,
    action,
    resource_type,
    resource_id,
    metadata,
    ip_address,
    user_agent
  ) VALUES (
    p_user_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_metadata,
    p_ip_address,
    p_user_agent
  ) RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to deduct credits from user
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_credits INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_credits INTEGER;
BEGIN
  -- Lock the row for update
  SELECT credits_remaining INTO v_current_credits
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;
  
  -- Check if sufficient credits
  IF v_current_credits < p_credits THEN
    RETURN FALSE;
  END IF;
  
  -- Deduct credits
  UPDATE users
  SET credits_remaining = credits_remaining - p_credits
  WHERE id = p_user_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add credits to user
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id UUID,
  p_credits INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE users
  SET credits_remaining = credits_remaining + p_credits
  WHERE id = p_user_id
  RETURNING credits_remaining INTO v_new_balance;
  
  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply referral credit on signup/activation
CREATE OR REPLACE FUNCTION apply_referral(
  p_referral_code TEXT,
  p_referred_product TEXT
)
RETURNS TABLE (referral_id UUID, credits_awarded INTEGER, referrer_user_id UUID) AS $$
DECLARE
  v_referral RECORD;
  v_referrer_tier TEXT;
  v_reward INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT * INTO v_referral
  FROM referrals
  WHERE referral_code = p_referral_code
  LIMIT 1
  FOR UPDATE;

  IF v_referral IS NULL THEN
    RETURN;
  END IF;

  IF v_referral.referred_user_id IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT tier INTO v_referrer_tier
  FROM users
  WHERE id = v_referral.referrer_user_id;

  SELECT credits_awarded INTO v_reward
  FROM referral_rewards
  WHERE referrer_tier = v_referrer_tier
    AND referred_product = p_referred_product
  LIMIT 1;

  UPDATE referrals
  SET referred_user_id = auth.uid(),
      status = 'completed',
      credits_awarded = COALESCE(v_reward, 0),
      referred_product = p_referred_product,
      referrer_tier_at_signup = v_referrer_tier,
      completed_at = NOW()
  WHERE id = v_referral.id;

  IF COALESCE(v_reward, 0) > 0 THEN
    PERFORM add_credits(v_referral.referrer_user_id, v_reward);
    PERFORM log_user_action(
      v_referral.referrer_user_id,
      'referral_credit_earned',
      'referrals',
      v_referral.id,
      jsonb_build_object('credits', v_reward, 'referred_product', p_referred_product)
    );
  END IF;

  RETURN QUERY SELECT v_referral.id, COALESCE(v_reward, 0), v_referral.referrer_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
GRANT EXECUTE ON FUNCTION apply_referral(TEXT, TEXT) TO authenticated;

-- ============================================================================
-- EMAIL COLLECTIONS TABLE (Pre-Launch Signups)
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  is_investor BOOLEAN NOT NULL DEFAULT false,
  source TEXT DEFAULT 'pre_launch_modal' CHECK (source IN ('pre_launch_modal', 'landing_page', 'referral', 'other')),
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for email_collections
CREATE INDEX IF NOT EXISTS idx_email_collections_email ON email_collections(email);
CREATE INDEX IF NOT EXISTS idx_email_collections_created_at ON email_collections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_collections_is_investor ON email_collections(is_investor);
CREATE INDEX IF NOT EXISTS idx_email_collections_source ON email_collections(source);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_collections_email_unique ON email_collections(email);

-- ============================================================================
-- VIDEO PLAYS TABLE (Track video play counts for network effect)
-- ============================================================================
CREATE TABLE IF NOT EXISTS video_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_url TEXT NOT NULL,
  video_id TEXT NOT NULL, -- Identifier for the video (e.g., 'video2', 'video3')
  display_count INTEGER NOT NULL DEFAULT 12347, -- Network effect number (starts at 12347+)
  actual_play_count INTEGER NOT NULL DEFAULT 0, -- Real play count from backend
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for video_plays
CREATE INDEX IF NOT EXISTS idx_video_plays_video_id ON video_plays(video_id);
CREATE INDEX IF NOT EXISTS idx_video_plays_video_url ON video_plays(video_url);
CREATE INDEX IF NOT EXISTS idx_video_plays_created_at ON video_plays(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_plays_video_id_unique ON video_plays(video_id);

-- RLS Policy: Allow public reads (for displaying play counts), restrict writes to service role
ALTER TABLE video_plays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_plays_select_public ON video_plays;
CREATE POLICY video_plays_select_public ON video_plays FOR SELECT TO anon, authenticated, public USING (true);
DROP POLICY IF EXISTS video_plays_insert_service_role ON video_plays;
CREATE POLICY video_plays_insert_service_role ON video_plays FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS video_plays_update_service_role ON video_plays;
CREATE POLICY video_plays_update_service_role ON video_plays FOR UPDATE TO service_role USING (true);

-- RLS Policy: Allow public inserts (for pre-launch signups), but restrict reads to admins
ALTER TABLE email_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_collections_insert_public ON email_collections;
CREATE POLICY email_collections_insert_public ON email_collections FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS email_collections_select_service_role ON email_collections;
CREATE POLICY email_collections_select_service_role ON email_collections FOR SELECT TO service_role USING (true);

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- None needed for production (seeding done separately for dev/test)

