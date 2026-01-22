-- Vannilli Database Schema
-- PostgreSQL 15+ (Supabase)
-- Version: 1.0
-- Last Updated: January 22, 2026

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE
-- ============================================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  stripe_customer_id TEXT UNIQUE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'open_mic', 'indie_artist', 'artist', 'label')),
  credits_remaining INTEGER NOT NULL DEFAULT 0,
  free_generation_redeemed BOOLEAN NOT NULL DEFAULT false,
  device_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX idx_users_device_fingerprint ON users(device_fingerprint);
CREATE INDEX idx_users_tier ON users(tier);

-- ============================================================================
-- PROJECTS TABLE
-- ============================================================================
CREATE TABLE projects (
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
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

-- ============================================================================
-- GENERATIONS TABLE
-- ============================================================================
CREATE TABLE generations (
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
CREATE INDEX idx_generations_project_id ON generations(project_id);
CREATE INDEX idx_generations_internal_task_id ON generations(internal_task_id);
CREATE INDEX idx_generations_kling_task_id ON generations(kling_task_id);
CREATE INDEX idx_generations_status ON generations(status);
CREATE INDEX idx_generations_created_at ON generations(created_at DESC);

-- ============================================================================
-- SUBSCRIPTIONS TABLE
-- ============================================================================
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('open_mic', 'indie_artist', 'artist', 'label')),
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'paused')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for subscriptions
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- ============================================================================
-- AUDIT LOG TABLE
-- ============================================================================
CREATE TABLE audit_log (
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
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);

-- ============================================================================
-- REFERRALS TABLE (for viral growth)
-- ============================================================================
CREATE TABLE referrals (
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
CREATE INDEX idx_referrals_referrer ON referrals(referrer_user_id);
CREATE INDEX idx_referrals_code ON referrals(referral_code);
CREATE INDEX idx_referrals_status ON referrals(status);

-- ============================================================================
-- CONTENT REPORTS TABLE (for moderation)
-- ============================================================================
CREATE TABLE content_reports (
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
CREATE INDEX idx_content_reports_generation ON content_reports(reported_generation_id);
CREATE INDEX idx_content_reports_status ON content_reports(status);
CREATE INDEX idx_content_reports_created_at ON content_reports(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;

-- Users: Can only read/update their own data
CREATE POLICY users_select_own ON users 
  FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY users_update_own ON users 
  FOR UPDATE 
  USING (auth.uid() = id);

-- Projects: Users can only access their own projects
CREATE POLICY projects_select_own ON projects 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY projects_insert_own ON projects 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY projects_update_own ON projects 
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY projects_delete_own ON projects 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Generations: Users can only access generations for their projects
CREATE POLICY generations_select_own ON generations 
  FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = generations.project_id 
    AND projects.user_id = auth.uid()
  ));

CREATE POLICY generations_insert_own ON generations 
  FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = generations.project_id 
    AND projects.user_id = auth.uid()
  ));

-- Subscriptions: Users can only see their own subscriptions
CREATE POLICY subscriptions_select_own ON subscriptions 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Audit Log: Users can only see their own audit logs
CREATE POLICY audit_log_select_own ON audit_log 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- Referrals: Users can see referrals they made or received
CREATE POLICY referrals_select_own ON referrals 
  FOR SELECT 
  USING (auth.uid() = referrer_user_id OR auth.uid() = referred_user_id);

-- Content Reports: Users can insert reports and see their own
CREATE POLICY content_reports_select_own ON content_reports 
  FOR SELECT 
  USING (auth.uid() = reporter_user_id);

CREATE POLICY content_reports_insert ON content_reports 
  FOR INSERT 
  WITH CHECK (auth.uid() = reporter_user_id);

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

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at 
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at 
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- None needed for production (seeding done separately for dev/test)

