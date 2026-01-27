-- ============================================================================
-- FIX GENERATIONS TABLE: Make project_id nullable for queue system
-- ============================================================================
-- For DEMO/Industry tiers using video_jobs queue, generations don't need project_id
-- This allows generations to be created without a project (linked via video_jobs instead)

-- Step 1: Drop foreign key constraint
ALTER TABLE generations DROP CONSTRAINT IF EXISTS generations_project_id_fkey;

-- Step 2: Make project_id nullable
ALTER TABLE generations ALTER COLUMN project_id DROP NOT NULL;

-- Step 3: Re-add foreign key constraint (allows NULL)
ALTER TABLE generations ADD CONSTRAINT generations_project_id_fkey 
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- Step 4: Update RLS policies to allow generations without project_id
-- (if linked to video_jobs owned by user)

-- Drop existing policies
DROP POLICY IF EXISTS generations_select_own ON generations;
DROP POLICY IF EXISTS generations_insert_own ON generations;

-- New SELECT policy: Allow if:
-- 1. Generation belongs to user's project (legacy flow), OR
-- 2. Generation is linked to user's video_job (queue system), OR
-- 3. Generation has no project_id (queue system - will be linked via video_jobs)
CREATE POLICY generations_select_own ON generations FOR SELECT
  TO authenticated
  USING (
    -- Legacy: belongs to user's project
    (project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = generations.project_id 
      AND projects.user_id = auth.uid()
    ))
    OR
    -- Queue system: linked to user's video_job
    EXISTS (
      SELECT 1 FROM video_jobs 
      WHERE video_jobs.generation_id = generations.id 
      AND video_jobs.user_id = auth.uid()
    )
    OR
    -- Queue system: no project_id yet (will be linked via video_jobs)
    (project_id IS NULL AND auth.uid() IS NOT NULL)
  );

-- New INSERT policy: Allow if:
-- 1. Generation belongs to user's project (legacy flow), OR
-- 2. No project_id AND user is authenticated (for queue system - will be linked via video_jobs)
CREATE POLICY generations_insert_own ON generations FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Legacy: belongs to user's project
    (project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = generations.project_id 
      AND projects.user_id = auth.uid()
    ))
    OR
    -- Queue system: no project_id required (will be linked via video_jobs)
    -- User must be authenticated (checked by TO authenticated)
    (project_id IS NULL AND auth.uid() IS NOT NULL)
  );

-- Step 5: Add UPDATE policy for queue system
DROP POLICY IF EXISTS generations_update_own ON generations;
CREATE POLICY generations_update_own ON generations FOR UPDATE
  TO authenticated
  USING (
    -- Legacy: belongs to user's project
    (project_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM projects 
      WHERE projects.id = generations.project_id 
      AND projects.user_id = auth.uid()
    ))
    OR
    -- Queue system: linked to user's video_job
    EXISTS (
      SELECT 1 FROM video_jobs 
      WHERE video_jobs.generation_id = generations.id 
      AND video_jobs.user_id = auth.uid()
    )
    OR
    -- Queue system: no project_id yet (will be linked via video_jobs)
    (project_id IS NULL AND auth.uid() IS NOT NULL)
  );
