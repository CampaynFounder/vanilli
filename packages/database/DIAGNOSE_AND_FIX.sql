-- ============================================================================
-- STEP 1: DIAGNOSE - Check current policy state
-- ============================================================================
-- Run this first to see what's currently set up
SELECT 
  policyname,
  roles,
  cmd,
  permissive,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'email_collections'
ORDER BY policyname;

-- ============================================================================
-- STEP 2: FIX - Run this to fix the policy
-- ============================================================================

-- First, drop ALL existing policies to start fresh
DROP POLICY IF EXISTS email_collections_insert_public ON email_collections;
DROP POLICY IF EXISTS email_collections_insert_anon ON email_collections;
DROP POLICY IF EXISTS email_collections_insert_authenticated ON email_collections;

-- Ensure RLS is enabled
ALTER TABLE email_collections ENABLE ROW LEVEL SECURITY;

-- Create the policy with ALL three roles: anon, authenticated, public
-- This is critical - the frontend uses 'anon' role
CREATE POLICY email_collections_insert_public ON email_collections 
  FOR INSERT 
  TO anon, authenticated, public
  WITH CHECK (true);

-- ============================================================================
-- STEP 3: VERIFY - Run this to confirm it worked
-- ============================================================================
SELECT 
  policyname,
  roles,
  cmd,
  with_check
FROM pg_policies 
WHERE tablename = 'email_collections';

-- Expected output:
-- policyname: email_collections_insert_public
-- roles: {anon,authenticated,public}  <-- MUST include 'anon'
-- cmd: INSERT
-- with_check: true

-- ============================================================================
-- STEP 4: TEST - Try inserting a test row (optional, for verification)
-- ============================================================================
-- This should work without errors if the policy is correct
-- INSERT INTO email_collections (email, phone, is_investor, source)
-- VALUES ('test@example.com', '555-1234', false, 'test');
-- 
-- Then delete it:
-- DELETE FROM email_collections WHERE email = 'test@example.com';

