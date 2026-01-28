-- ============================================================================
-- SIGNUP CHANNEL: Track acquisition source (e.g. socialsignup, mobile)
-- ============================================================================
-- Run in Supabase SQL Editor. Tracks where users signed up for analytics.
-- Requires sync-auth-user-to-public-on-signup trigger to exist (creates/replaces
-- the sync function only).

-- 1) Add column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_channel TEXT;

-- 2) Index for analytics (e.g. COUNT WHERE signup_channel = 'socialsignup')
CREATE INDEX IF NOT EXISTS idx_users_signup_channel ON users(signup_channel) WHERE signup_channel IS NOT NULL;

-- 3) Extend sync trigger to set signup_channel from auth user_metadata
--    When signUp({ options: { data: { signup_channel: 'socialsignup' } } }), it flows to public.users.
CREATE OR REPLACE FUNCTION public.sync_auth_user_to_public()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uemail TEXT;
  v_channel TEXT;
BEGIN
  uemail := COALESCE(NULLIF(TRIM(COALESCE(NEW.email, '')), ''), NEW.id::text || '@auth.local');
  v_channel := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'signup_channel', '')), '');
  INSERT INTO public.users (id, email, password_hash, signup_channel)
  VALUES (NEW.id, uemail, '', v_channel)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'sync_auth_user_to_public: insert failed for % (%). claim-free-credits-setup will create the row.', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;
