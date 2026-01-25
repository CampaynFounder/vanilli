-- ============================================================================
-- STORAGE: Allow authenticated (Studio) and service_role (Modal) for vannilli/inputs/ and outputs/
-- ============================================================================
-- Run in Supabase SQL Editor. Fixes 403 "new row violates row-level security policy"
-- when: (a) Studio uploads tracking.mp4, target.jpg, audio.mp3 to inputs/{id}/, or
--       (b) Modal uploads tracking_trimmed.mp4 / outputs/final.mp4.
--
-- inputs/: Authenticated (browser) uploads initial files; service_role (Modal) uploads
--   tracking_trimmed.mp4 when generation_seconds > 0.
-- outputs/: service_role (Modal) uploads final.mp4.

-- ---------- inputs/ (authenticated: Studio upload + createSignedUrl) ----------
-- INSERT: authenticated can upload to inputs/ (Studio: tracking.mp4, target.jpg, audio.mp3)
DROP POLICY IF EXISTS "inputs_authenticated_insert" ON storage.objects;
CREATE POLICY "inputs_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vannilli' AND name LIKE 'inputs/%');

-- UPDATE: authenticated can overwrite (Studio uses upsert: true)
DROP POLICY IF EXISTS "inputs_authenticated_update" ON storage.objects;
CREATE POLICY "inputs_authenticated_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'vannilli' AND name LIKE 'inputs/%');

-- SELECT: authenticated can read inputs/ (createSignedUrl for Modal)
DROP POLICY IF EXISTS "inputs_authenticated_select" ON storage.objects;
CREATE POLICY "inputs_authenticated_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'vannilli' AND name LIKE 'inputs/%');

-- ---------- inputs/ (service_role: Modal) ----------
-- INSERT: service_role can upload new objects under inputs/
DROP POLICY IF EXISTS "inputs_service_role_insert" ON storage.objects;
CREATE POLICY "inputs_service_role_insert" ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'vannilli' AND name LIKE 'inputs/%');

-- UPDATE: service_role can overwrite existing objects under inputs/
DROP POLICY IF EXISTS "inputs_service_role_update" ON storage.objects;
CREATE POLICY "inputs_service_role_update" ON storage.objects
  FOR UPDATE TO service_role
  USING (bucket_id = 'vannilli' AND name LIKE 'inputs/%');

-- SELECT: service_role can read inputs/ (e.g. create_signed_url)
DROP POLICY IF EXISTS "inputs_service_role_select" ON storage.objects;
CREATE POLICY "inputs_service_role_select" ON storage.objects
  FOR SELECT TO service_role
  USING (bucket_id = 'vannilli' AND name LIKE 'inputs/%');

-- DELETE: service_role can remove inputs/ after processing (Modal cleans up)
DROP POLICY IF EXISTS "inputs_service_role_delete" ON storage.objects;
CREATE POLICY "inputs_service_role_delete" ON storage.objects
  FOR DELETE TO service_role
  USING (bucket_id = 'vannilli' AND name LIKE 'inputs/%');

-- ---------- outputs/ ----------
-- INSERT: service_role can upload final.mp4 under outputs/
DROP POLICY IF EXISTS "outputs_service_role_insert" ON storage.objects;
CREATE POLICY "outputs_service_role_insert" ON storage.objects
  FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'vannilli' AND name LIKE 'outputs/%');

-- UPDATE: service_role can overwrite outputs/ (e.g. re-run)
DROP POLICY IF EXISTS "outputs_service_role_update" ON storage.objects;
CREATE POLICY "outputs_service_role_update" ON storage.objects
  FOR UPDATE TO service_role
  USING (bucket_id = 'vannilli' AND name LIKE 'outputs/%');

-- SELECT: service_role can read outputs/
DROP POLICY IF EXISTS "outputs_service_role_select" ON storage.objects;
CREATE POLICY "outputs_service_role_select" ON storage.objects
  FOR SELECT TO service_role
  USING (bucket_id = 'vannilli' AND name LIKE 'outputs/%');

-- DELETE: optional; Modal does not delete outputs
DROP POLICY IF EXISTS "outputs_service_role_delete" ON storage.objects;
CREATE POLICY "outputs_service_role_delete" ON storage.objects
  FOR DELETE TO service_role
  USING (bucket_id = 'vannilli' AND name LIKE 'outputs/%');

-- ============================================================================
-- VERIFICATION (idempotent, read-only): Run after applying to confirm policies exist.
-- ============================================================================
SELECT policyname, cmd, roles
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND (policyname LIKE 'inputs_%' OR policyname LIKE 'outputs_%')
  ORDER BY policyname;
-- Expected: inputs_authenticated_insert, update, select; inputs_service_role_insert, update, select, delete;
--           outputs_service_role_insert, update, select, delete.
