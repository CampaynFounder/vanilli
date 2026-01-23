-- ============================================================================
-- COPY AND PASTE THIS ENTIRE SCRIPT INTO SUPABASE SQL EDITOR
-- ============================================================================
-- This will fix the 42501 error by allowing 'anon' role to insert emails
-- ============================================================================

-- Step 1: Drop the existing policy (it only allows 'public', not 'anon')
DROP POLICY IF EXISTS email_collections_insert_public ON email_collections;

-- Step 2: Create new policy that allows anon, authenticated, AND public roles
CREATE POLICY email_collections_insert_public ON email_collections 
  FOR INSERT 
  TO anon, authenticated, public
  WITH CHECK (true);

-- Step 3: Verify it worked (run this query after the above)
-- You should see roles: {anon,authenticated,public}
SELECT 
  policyname,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'email_collections';

-- ============================================================================
-- DONE! Now try submitting the email form again.
-- ============================================================================

