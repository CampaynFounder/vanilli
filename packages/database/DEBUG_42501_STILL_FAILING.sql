-- ============================================================================
-- DEBUG: Why is 42501 still happening when anon policy exists?
-- ============================================================================
-- Run this to diagnose the issue
-- ============================================================================

-- Step 1: Check ALL policies on the table
SELECT 
  policyname,
  roles,
  cmd,
  permissive,
  qual,
  with_check,
  schemaname
FROM pg_policies 
WHERE tablename = 'email_collections'
ORDER BY policyname;

-- Step 2: Check if RLS is actually enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'email_collections';

-- Step 3: Check table structure and constraints
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'email_collections'
ORDER BY ordinal_position;

-- Step 4: Try to manually test the insert as anon role
-- This will show us the exact error
SET ROLE anon;
INSERT INTO email_collections (email, phone, is_investor, source, user_agent)
VALUES ('test-debug@example.com', '555-0000', false, 'pre_launch_modal', 'test');
RESET ROLE;

-- Step 5: Check if there are any conflicting policies
-- Sometimes multiple policies can conflict
SELECT 
  COUNT(*) as policy_count,
  STRING_AGG(policyname, ', ') as policy_names
FROM pg_policies 
WHERE tablename = 'email_collections'
  AND cmd = 'INSERT';

-- ============================================================================
-- COMMON ISSUES:
-- 1. Multiple INSERT policies conflicting
-- 2. WITH CHECK clause evaluating to false
-- 3. RLS enabled but policy not properly applied
-- 4. Wrong schema (policy in wrong schema)
-- ============================================================================


