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
--    Uses EXCEPTION so a failed insert (e.g. RLS, unique email) does NOT abort
--    signup; claim-free-credits-setup will create the row when needed.
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
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'sync_auth_user_to_public: insert failed for % (%). claim-free-credits-setup will create the row.', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 2) Trigger on auth.users (AFTER INSERT)
DROP TRIGGER IF EXISTS on_auth_user_created_sync_to_public_users ON auth.users;
CREATE TRIGGER on_auth_user_created_sync_to_public_users
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_to_public();

-- 3) Optional: allow auth role to INSERT into public.users so the trigger succeeds.
--    If supabase_auth_admin does not exist, this block is a no-op.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    DROP POLICY IF EXISTS users_insert_auth_sync ON users;
    CREATE POLICY users_insert_auth_sync ON users FOR INSERT
      TO supabase_auth_admin WITH CHECK (true);
  END IF;
END $$;
