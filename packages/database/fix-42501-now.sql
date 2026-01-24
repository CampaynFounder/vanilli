-- DIRECT FIX FOR 42501 ERROR - Run this NOW in Supabase SQL Editor
-- The policy currently only has {public} role, but needs {anon} role

-- Step 1: Drop the existing policy
DROP POLICY IF EXISTS email_collections_insert_public ON email_collections;

-- Step 2: Recreate with anon role (this is what the frontend uses)
CREATE POLICY email_collections_insert_public ON email_collections 
  FOR INSERT 
  TO anon, authenticated, public
  WITH CHECK (true);

-- Step 3: Verify it worked (run this separately to check)
-- SELECT policyname, roles, cmd FROM pg_policies WHERE tablename = 'email_collections';

-- After running, you should see: roles = {anon,authenticated,public}


