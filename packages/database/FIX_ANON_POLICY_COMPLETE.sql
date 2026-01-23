-- ============================================================================
-- COMPLETE FIX: Ensure anon policy works correctly
-- ============================================================================
-- If you see the anon role but still get 42501, run this
-- ============================================================================

-- Step 1: Check current policies (diagnostic)
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

-- Step 2: Drop the anon policy if it exists (to recreate it correctly)
DROP POLICY IF EXISTS email_collections_insert_anon ON email_collections;

-- Step 3: Ensure RLS is enabled
ALTER TABLE email_collections ENABLE ROW LEVEL SECURITY;

-- Step 4: Recreate the anon policy with explicit PERMISSIVE and WITH CHECK
CREATE POLICY email_collections_insert_anon 
  ON email_collections 
  AS PERMISSIVE
  FOR INSERT 
  TO anon
  WITH CHECK (true);

-- Step 5: Verify the policy was created correctly
SELECT 
  policyname,
  roles,
  cmd,
  permissive,
  with_check
FROM pg_policies 
WHERE tablename = 'email_collections'
  AND policyname = 'email_collections_insert_anon';

-- Expected:
-- permissive: PERMISSIVE
-- with_check: true
-- roles: {anon}

-- Step 6: Test insert (optional - to verify it works)
-- This should work if the policy is correct:
-- INSERT INTO email_collections (email, phone, is_investor, source)
-- VALUES ('test-anon@example.com', '555-0000', false, 'test');
-- 
-- If it works, delete it:
-- DELETE FROM email_collections WHERE email = 'test-anon@example.com';

-- ============================================================================
-- If still not working, check:
-- 1. Are you using the correct Supabase project?
-- 2. Is the anon key correct in Cloudflare Pages env vars?
-- 3. Did you trigger a new deployment after setting env vars?
-- ============================================================================

