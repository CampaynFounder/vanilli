/**
 * Project management routes
 */

import { Hono } from 'hono';
import { requireAuth, getSupabaseClient } from '../lib/auth';
import { calculateVideoSeconds } from '@vannilli/music-calculator';
import type { Env, AuthUser } from '../types';

export const projectRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /api/projects
 * List user's projects
 */
projectRoutes.get('/', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const status = c.req.query('status');

  const supabase = getSupabaseClient(c.env);

  let query = supabase
    .from('projects')
    .select('*, generations(*)', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: projects, error, count } = await query;

  if (error) {
    return c.json(
      {
        error: {
          code: 'QUERY_FAILED',
          message: 'Failed to fetch projects',
        },
      },
      500
    );
  }

  return c.json({
    projects: projects || [],
    total: count || 0,
    limit,
    offset,
  });
});

/**
 * POST /api/projects
 * Create a new project
 */
projectRoutes.post('/', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const { trackName, bpm, bars } = await c.req.json();

  if (!trackName || !bpm || !bars) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Track name, BPM, and bars are required',
        },
      },
      400
    );
  }

  try {
    const durationSeconds = calculateVideoSeconds(bpm, bars);
    const supabase = getSupabaseClient(c.env);

    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        track_name: trackName,
        bpm,
        bars,
        duration_seconds: durationSeconds,
        target_image_r2_path: '', // Will be filled on upload
        driver_video_r2_path: '', // Will be filled on upload
        status: 'draft',
      })
      .select()
      .single();

    if (error || !project) {
      return c.json(
        {
          error: {
            code: 'CREATION_FAILED',
            message: 'Failed to create project',
          },
        },
        500
      );
    }

    return c.json(
      {
        id: project.id,
        trackName: project.track_name,
        bpm: project.bpm,
        bars: project.bars,
        durationSeconds: project.duration_seconds,
        status: project.status,
        createdAt: project.created_at,
      },
      201
    );
  } catch (error) {
    return c.json(
      {
        error: {
          code: 'INVALID_INPUT',
          message: error instanceof Error ? error.message : 'Invalid project data',
        },
      },
      400
    );
  }
});

/**
 * GET /api/projects/:id
 * Get project details
 */
projectRoutes.get('/:id', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const projectId = c.req.param('id');

  const supabase = getSupabaseClient(c.env);

  const { data: project, error } = await supabase
    .from('projects')
    .select('*, generations(*)')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (error || !project) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Project not found',
        },
      },
      404
    );
  }

  return c.json(project);
});

/**
 * DELETE /api/projects/:id
 * Delete a project
 */
projectRoutes.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const projectId = c.req.param('id');

  const supabase = getSupabaseClient(c.env);

  // Verify ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (!project) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Project not found',
        },
      },
      404
    );
  }

  // Delete project (cascades to generations)
  const { error } = await supabase.from('projects').delete().eq('id', projectId);

  if (error) {
    return c.json(
      {
        error: {
          code: 'DELETE_FAILED',
          message: 'Failed to delete project',
        },
      },
      500
    );
  }

  return c.body(null, 204);
});

/**
 * GET /api/projects/history
 * Get all user's projects with generations for history view
 */
projectRoutes.get('/history', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const supabase = getSupabaseClient(c.env);

  const { data: projects, error, count } = await supabase
    .from('projects')
    .select('*, generations(*)', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return c.json(
      {
        error: {
          code: 'QUERY_FAILED',
          message: 'Failed to fetch project history',
        },
      },
      500
    );
  }

  return c.json({
    projects: projects || [],
    total: count || 0,
    limit,
    offset,
  });
});

/**
 * GET /api/generations/history
 * Get all user's generations across all projects
 */
projectRoutes.get('/generations/history', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const status = c.req.query('status'); // Filter by status

  const supabase = getSupabaseClient(c.env);

  // Get all generations for user's projects
  let query = supabase
    .from('generations')
    .select('*, projects!inner(user_id, track_name, bpm, bars)', { count: 'exact' })
    .eq('projects.user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: generations, error, count } = await query;

  if (error) {
    return c.json(
      {
        error: {
          code: 'QUERY_FAILED',
          message: 'Failed to fetch generation history',
        },
      },
      500
    );
  }

  return c.json({
    generations: generations || [],
    total: count || 0,
    limit,
    offset,
  });
});


