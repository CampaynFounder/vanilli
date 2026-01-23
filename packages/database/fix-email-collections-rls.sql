-- Fix RLS Policy for email_collections table
-- Run this in Supabase SQL Editor if you're getting 42501 errors

-- First, drop existing policies if they exist
DROP POLICY IF EXISTS email_collections_insert_public ON email_collections;
DROP POLICY IF EXISTS email_collections_select_admin ON email_collections;

-- Ensure RLS is enabled
ALTER TABLE email_collections ENABLE ROW LEVEL SECURITY;

-- Allow anyone (including anonymous users) to insert into email_collections
-- This is needed for pre-launch signups
CREATE POLICY email_collections_insert_public ON email_collections 
  FOR INSERT 
  TO anon, authenticated
  WITH CHECK (true);

-- Allow service role to read (for admin access)
-- Public/anonymous users cannot read
CREATE POLICY email_collections_select_service_role ON email_collections 
  FOR SELECT 
  TO service_role
  USING (true);

-- Optional: Allow authenticated users to read their own entries (if you add user_id later)
-- CREATE POLICY email_collections_select_own ON email_collections 
--   FOR SELECT 
--   TO authenticated
--   USING (auth.uid()::text = user_id::text);

