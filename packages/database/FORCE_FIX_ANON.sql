-- ============================================================================
-- FORCE FIX: This will definitely add 'anon' role to the policy
-- ============================================================================
-- If you're still seeing {public} only, run this entire script
-- ============================================================================

-- Step 1: Show current state (for reference)
SELECT 
  'BEFORE FIX' as status,
  policyname,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'email_collections';

-- Step 2: Drop the existing policy completely
DROP POLICY IF EXISTS email_collections_insert_public ON email_collections;

-- Step 3: Ensure RLS is enabled (sometimes this gets disabled)
ALTER TABLE email_collections ENABLE ROW LEVEL SECURITY;

-- Step 4: Create the policy with EXPLICIT role list
-- Using explicit role names, not shortcuts
CREATE POLICY email_collections_insert_public 
  ON email_collections 
  FOR INSERT 
  TO anon, authenticated, public
  WITH CHECK (true);

-- Step 5: Verify it was created correctly
SELECT 
  'AFTER FIX' as status,
  policyname,
  roles,
  cmd,
  permissive
FROM pg_policies 
WHERE tablename = 'email_collections';

-- ============================================================================
-- EXPECTED RESULT:
-- roles should be: {anon,authenticated,public}
-- If you still see {public} only, there may be a Supabase permission issue
-- ============================================================================

-- Step 6: If still not working, try creating separate policies for each role
-- (Uncomment and run if the above didn't work)

/*
DROP POLICY IF EXISTS email_collections_insert_public ON email_collections;

-- Policy for anon role
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
*/


