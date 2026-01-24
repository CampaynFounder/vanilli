-- ============================================================================
-- CREATE ANON POLICY - Run this NOW in Supabase SQL Editor
-- ============================================================================
-- This will create a policy specifically for the 'anon' role
-- ============================================================================

-- Step 1: Create the anon policy (this is what the frontend needs!)
CREATE POLICY email_collections_insert_anon 
  ON email_collections 
  FOR INSERT 
  TO anon
  WITH CHECK (true);

-- Step 2: Verify it was created
SELECT 
  policyname,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'email_collections'
ORDER BY policyname;

-- Expected: You should now see email_collections_insert_anon with roles: {anon}

-- ============================================================================
-- That's it! Now try submitting the form again.
-- ============================================================================


