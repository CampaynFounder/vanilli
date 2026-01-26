-- ============================================================================
-- STORAGE: Allow authenticated users to read outputs/ for their own generations
-- ============================================================================
-- This enables Studio to create signed URLs and play/download completed videos.
-- Users can only access outputs/ for generations they own (via projects.user_id = auth.uid()).

-- SELECT: authenticated can read outputs/ if they own the generation
-- (We verify ownership via the generations table, which links to projects.user_id)
DROP POLICY IF EXISTS "outputs_authenticated_select" ON storage.objects;
CREATE POLICY "outputs_authenticated_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'vannilli' 
    AND name LIKE 'outputs/%'
    AND EXISTS (
      SELECT 1 
      FROM public.generations g
      JOIN public.projects p ON p.id = g.project_id
      WHERE g.final_video_r2_path = storage.objects.name
        AND p.user_id = auth.uid()
    )
  );

-- ============================================================================
-- VERIFICATION: Check that the policy exists
-- ============================================================================
SELECT policyname, cmd, roles
  FROM pg_policies
  WHERE schemaname = 'storage' 
    AND tablename = 'objects'
    AND policyname = 'outputs_authenticated_select';
