-- ============================================================================
-- SYNC auth.users → public.users ON SIGNUP
-- ============================================================================
-- Creates a public.users row whenever a new auth.users row is inserted (signup).
-- This ensures claim-free-credits-setup and Profile always find a public.users
-- record for authenticated users.
--
-- Run this in the Supabase SQL Editor (as postgres or project owner).
-- If the trigger already exists, the DROP and CREATE are idempotent.

-- 1) Function: insert into public.users from NEW (trigger row)
CREATE OR REPLACE FUNCTION public.sync_auth_user_to_public()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uemail TEXT;
BEGIN
  uemail := COALESCE(NULLIF(TRIM(COALESCE(NEW.email, '')), ''), NEW.id::text || '@auth.local');
  INSERT INTO public.users (id, email, password_hash)
  VALUES (NEW.id, uemail, '')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2) Trigger on auth.users (AFTER INSERT)
DROP TRIGGER IF EXISTS on_auth_user_created_sync_to_public_users ON auth.users;
CREATE TRIGGER on_auth_user_created_sync_to_public_users
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_to_public();
