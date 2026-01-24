-- ============================================================================
-- AVATARS STORAGE (uses existing "vannilli" bucket, prefix avatars/)
-- ============================================================================
-- Run in Supabase SQL Editor. The "vannilli" bucket must exist (used by Studio).
-- AvatarUpload writes to: vannilli/avatars/{userId}_{timestamp}.{ext}
-- These policies allow: authenticated upload to avatars/*, public read.

-- Allow authenticated users to upload to avatars/
DROP POLICY IF EXISTS "avatars_upload" ON storage.objects;
CREATE POLICY "avatars_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vannilli' AND name LIKE 'avatars/%');

-- Allow anyone to read avatars (for profile images)
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'vannilli' AND name LIKE 'avatars/%');

-- Optional: allow authenticated users to update/delete their own avatars (avatars/{userId}_*)
-- DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
-- CREATE POLICY "avatars_update" ON storage.objects
--   FOR UPDATE TO authenticated USING (bucket_id = 'vannilli' AND name LIKE 'avatars/%');
-- DROP POLICY IF EXISTS "avatars_delete" ON storage.objects;
-- CREATE POLICY "avatars_delete" ON storage.objects
--   FOR DELETE TO authenticated USING (bucket_id = 'vannilli' AND name LIKE 'avatars/%');
