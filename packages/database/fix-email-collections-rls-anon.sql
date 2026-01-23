-- Fix: Add 'anon' role to email_collections insert policy
-- The current policy only allows 'public' role, but frontend uses 'anon' role

-- Drop the existing policy
DROP POLICY IF EXISTS email_collections_insert_public ON email_collections;

-- Recreate with 'anon' role included (this is what the frontend uses)
CREATE POLICY email_collections_insert_public ON email_collections 
  FOR INSERT 
  TO anon, authenticated, public
  WITH CHECK (true);

-- Verify it worked:
-- SELECT * FROM pg_policies WHERE tablename = 'email_collections';

