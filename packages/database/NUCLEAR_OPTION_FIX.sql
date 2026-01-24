-- ============================================================================
-- NUCLEAR OPTION: Complete reset of all RLS policies
-- ============================================================================
-- If nothing else works, run this to completely reset everything
-- ============================================================================

-- Step 1: Drop ALL policies (insert and select)
DROP POLICY IF EXISTS email_collections_insert_public ON email_collections;
DROP POLICY IF EXISTS email_collections_insert_anon ON email_collections;
DROP POLICY IF EXISTS email_collections_insert_authenticated ON email_collections;
DROP POLICY IF EXISTS email_collections_select_service_role ON email_collections;

-- Step 2: Disable RLS temporarily
ALTER TABLE email_collections DISABLE ROW LEVEL SECURITY;

-- Step 3: Re-enable RLS
ALTER TABLE email_collections ENABLE ROW LEVEL SECURITY;

-- Step 4: Create ONLY the anon policy (simplest approach)
CREATE POLICY email_collections_insert_anon 
  ON email_collections 
  AS PERMISSIVE
  FOR INSERT 
  TO anon
  WITH CHECK (true);

-- Step 5: Create the service role select policy
CREATE POLICY email_collections_select_service_role 
  ON email_collections 
  AS PERMISSIVE
  FOR SELECT 
  TO service_role
  USING (true);

-- Step 6: Verify
SELECT 
  policyname,
  roles,
  cmd,
  permissive,
  with_check
FROM pg_policies 
WHERE tablename = 'email_collections'
ORDER BY policyname;

-- Expected: Only 2 policies
-- 1. email_collections_insert_anon with roles: {anon}
-- 2. email_collections_select_service_role with roles: {service_role}

-- ============================================================================
-- This approach:
-- 1. Removes ALL existing policies
-- 2. Disables and re-enables RLS (fresh start)
-- 3. Creates only the essential policies
-- 4. Uses explicit PERMISSIVE keyword
-- ============================================================================


