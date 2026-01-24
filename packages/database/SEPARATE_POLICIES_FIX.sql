-- ============================================================================
-- ALTERNATIVE FIX: Create separate policies for each role
-- ============================================================================
-- If the combined policy isn't working, try this approach
-- ============================================================================

-- Step 1: Drop ALL existing insert policies
DROP POLICY IF EXISTS email_collections_insert_public ON email_collections;
DROP POLICY IF EXISTS email_collections_insert_anon ON email_collections;
DROP POLICY IF EXISTS email_collections_insert_authenticated ON email_collections;

-- Step 2: Ensure RLS is enabled
ALTER TABLE email_collections ENABLE ROW LEVEL SECURITY;

-- Step 3: Create SEPARATE policies for each role
-- This is more explicit and sometimes works better in Supabase

-- Policy for anon role (this is what the frontend uses!)
CREATE POLICY email_collections_insert_anon 
  ON email_collections 
  FOR INSERT 
  TO anon
  WITH CHECK (true);

-- Policy for authenticated role
CREATE POLICY email_collections_insert_authenticated 
  ON email_collections 
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);

-- Policy for public role
CREATE POLICY email_collections_insert_public 
  ON email_collections 
  FOR INSERT 
  TO public
  WITH CHECK (true);

-- Step 4: Verify all policies were created
SELECT 
  policyname,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'email_collections'
ORDER BY policyname;

-- Expected result: You should see THREE policies:
-- 1. email_collections_insert_anon with roles: {anon}
-- 2. email_collections_insert_authenticated with roles: {authenticated}
-- 3. email_collections_insert_public with roles: {public}
-- 4. email_collections_select_service_role with roles: {service_role}

-- ============================================================================
-- This approach uses separate policies instead of one combined policy
-- It's more explicit and sometimes works better in Supabase
-- ============================================================================


