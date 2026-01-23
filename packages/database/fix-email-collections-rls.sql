-- Fix RLS Policy for email_collections table
-- Run this in Supabase SQL Editor if you're getting 42501 errors
-- This script will fix the RLS policy to allow anonymous inserts

-- Step 1: Drop ALL existing policies on email_collections
DROP POLICY IF EXISTS email_collections_insert_public ON email_collections;
DROP POLICY IF EXISTS email_collections_select_admin ON email_collections;
DROP POLICY IF EXISTS email_collections_select_service_role ON email_collections;

-- Step 2: Ensure RLS is enabled
ALTER TABLE email_collections ENABLE ROW LEVEL SECURITY;

-- Step 3: Create policy that allows anonymous users to INSERT
-- This is critical for pre-launch signups from the public website
CREATE POLICY email_collections_insert_public ON email_collections 
  FOR INSERT 
  TO anon, authenticated, public
  WITH CHECK (true);

-- Step 4: Allow service role to read (for admin access via backend)
CREATE POLICY email_collections_select_service_role ON email_collections 
  FOR SELECT 
  TO service_role
  USING (true);

-- Step 5: Verify the policy was created
-- You should see the policy in: Authentication > Policies > email_collections

-- Test query (should work after running this):
-- INSERT INTO email_collections (email, phone, is_investor, source) 
-- VALUES ('test@example.com', '1234567890', false, 'pre_launch_modal');
