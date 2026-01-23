-- Fix: Add 'anon' role to email_collections insert policy
-- The current policy might only allow 'public' role, but frontend uses 'anon' role
-- Error: 42501 - "new row violates row-level security policy"

-- Step 1: Drop ALL existing policies on email_collections (to start fresh)
DROP POLICY IF EXISTS email_collections_insert_public ON email_collections;
DROP POLICY IF EXISTS email_collections_insert_anon ON email_collections;
DROP POLICY IF EXISTS email_collections_insert_authenticated ON email_collections;

-- Step 2: Ensure RLS is enabled
ALTER TABLE email_collections ENABLE ROW LEVEL SECURITY;

-- Step 3: Create a comprehensive INSERT policy that allows anon, authenticated, and public roles
-- This is what the frontend uses when making requests with the anon key
CREATE POLICY email_collections_insert_public ON email_collections 
  FOR INSERT 
  TO anon, authenticated, public
  WITH CHECK (true);

-- Step 4: Verify the policy was created correctly
-- Run this query to check:
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'email_collections';

-- Expected result:
-- roles should be: {anon,authenticated,public}
-- cmd should be: INSERT
-- with_check should be: true

