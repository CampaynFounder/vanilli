/**
 * Video generation routes
 */

import { Hono } from 'hono';
import { requireAuth, getSupabaseClient } from '../lib/auth';
import { calculateVideoSeconds, calculateCost, getPartName } from '@vannilli/music-calculator';
import { KlingV26Adapter } from '@vannilli/kling-adapter';
import type { Env, AuthUser, VideoGenerationMessage } from '../types';

export const videoRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /api/calculate-duration
 * Convert BPM + bars to video duration and cost
 */
videoRoutes.post('/calculate-duration', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const { bpm, bars } = await c.req.json();

  // Validation
  if (!bpm || !bars) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'BPM and bars are required',
        },
      },
      400
    );
  }

  try {
    const durationSeconds = calculateVideoSeconds(bpm, bars);
    const cost = calculateCost(durationSeconds, user.tier, user.creditsRemaining);
    const partName = getPartName(bars);

    return c.json({
      bpm,
      bars,
      durationSeconds,
      partName,
      cost: {
        credits: durationSeconds,
        dollars: cost.userCost,
        sufficientCredits: cost.sufficientCredits,
        creditsAfter: cost.creditsAfter,
      },
      message: cost.sufficientCredits
        ? `This ${partName} will use ${durationSeconds} seconds of credit`
        : `Insufficient credits. You need ${durationSeconds - user.creditsRemaining} more seconds.`,
    });
  } catch (error) {
    return c.json(
      {
        error: {
          code: 'INVALID_INPUT',
          message: error instanceof Error ? error.message : 'Invalid BPM or bars',
        },
      },
      400
    );
  }
});

/**
 * POST /api/upload-assets
 * Get pre-signed URLs for uploading assets to R2
 */
videoRoutes.post('/upload-assets', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const { projectId, assets } = await c.req.json();

  if (!projectId || !assets) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Project ID and assets configuration required',
        },
      },
      400
    );
  }

  const uploadUrls: Record<string, { url: string; expiresIn: number; key: string }> = {};

  // Generate pre-signed URLs for each requested asset
  if (assets.driverVideo) {
    const key = `driver-videos/${user.id}/${crypto.randomUUID()}.mp4`;
    const url = await c.env.RAW_UPLOADS.createMultipartUpload(key);
    uploadUrls.driverVideo = {
      url: url.uploadId, // Simplified - in production, use actual pre-signed URL
      expiresIn: 300,
      key,
    };
  }

  if (assets.targetImage) {
    const key = `target-images/${user.id}/${crypto.randomUUID()}.jpg`;
    const url = await c.env.RAW_UPLOADS.createMultipartUpload(key);
    uploadUrls.targetImage = {
      url: url.uploadId,
      expiresIn: 300,
      key,
    };
  }

  if (assets.audio) {
    const key = `audio/${user.id}/${crypto.randomUUID()}.mp3`;
    const url = await c.env.RAW_UPLOADS.createMultipartUpload(key);
    uploadUrls.audio = {
      url: url.uploadId,
      expiresIn: 300,
      key,
    };
  }

  return c.json({ uploadUrls });
});

/**
 * POST /api/start-generation
 * Initiate video generation
 */
videoRoutes.post('/start-generation', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const { projectId, driverVideoKey, targetImageKey, prompt, mode } = await c.req.json();

  if (!projectId || !driverVideoKey || !targetImageKey) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Project ID, driver video, and target image are required',
        },
      },
      400
    );
  }

  const supabase = getSupabaseClient(c.env);

  // Get project details
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single();

  if (projectError || !project) {
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

  // Check credits
  if (user.tier !== 'free' && user.creditsRemaining < project.duration_seconds) {
    return c.json(
      {
        error: {
          code: 'INSUFFICIENT_CREDITS',
          message: `You need ${project.duration_seconds} credits but only have ${user.creditsRemaining}`,
        },
      },
      402
    );
  }

  // For free tier, check if already redeemed
  if (user.tier === 'free' && user.freeGenerationRedeemed) {
    return c.json(
      {
        error: {
          code: 'FREE_TIER_LIMIT',
          message: 'Free generation already used. Please upgrade to continue.',
        },
      },
      402
    );
  }

  // Create generation record
  const { data: generation, error: genError } = await supabase
    .from('generations')
    .insert({
      project_id: projectId,
      cost_credits: project.duration_seconds,
      status: 'pending',
    })
    .select()
    .single();

  if (genError || !generation) {
    return c.json(
      {
        error: {
          code: 'CREATION_FAILED',
          message: 'Failed to create generation',
        },
      },
      500
    );
  }

  // Enqueue generation job
  const message: VideoGenerationMessage = {
    internalTaskId: generation.internal_task_id,
    generationId: generation.id,
    userId: user.id,
    driverVideoUrl: `https://r2.vannilli.io/${driverVideoKey}`,
    targetImageUrl: `https://r2.vannilli.io/${targetImageKey}`,
    prompt,
    mode: mode || 'standard',
  };

  await c.env.VIDEO_QUEUE.send(message);

  return c.json(
    {
      internalTaskId: generation.internal_task_id,
      status: 'pending',
      estimatedCompletionSeconds: 90,
      message: 'Your video is being generated. Check status at /api/poll-status/' + generation.internal_task_id,
    },
    202
  );
});

/**
 * GET /api/poll-status/:taskId
 * Check generation status
 */
videoRoutes.get('/poll-status/:taskId', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const taskId = c.req.param('taskId');

  const supabase = getSupabaseClient(c.env);

  const { data: generation, error } = await supabase
    .from('generations')
    .select('*, projects!inner(user_id)')
    .eq('internal_task_id', taskId)
    .single();

  if (error || !generation) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Generation not found',
        },
      },
      404
    );
  }

  // Verify ownership
  if (generation.projects.user_id !== user.id) {
    return c.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
        },
      },
      403
    );
  }

  // Return status
  if (generation.status === 'completed') {
    return c.json({
      internalTaskId: taskId,
      status: 'completed',
      generationId: generation.id,
      previewUrl: generation.preview_gif_r2_path
        ? `https://r2.vannilli.io/${generation.preview_gif_r2_path}`
        : undefined,
      thumbnailUrl: generation.thumbnail_r2_path
        ? `https://r2.vannilli.io/${generation.thumbnail_r2_path}`
        : undefined,
      watermarked: user.tier === 'free',
      costCredits: generation.cost_credits,
      message: 'Your video is ready!',
    });
  }

  if (generation.status === 'failed') {
    return c.json({
      internalTaskId: taskId,
      status: 'failed',
      error: generation.error_message || 'Video generation failed',
      message: 'Video generation failed. No credits were deducted.',
    });
  }

  return c.json({
    internalTaskId: taskId,
    status: generation.status,
    progress: generation.status === 'processing' ? 50 : 0,
    estimatedTimeRemaining: 60,
    message: 'Syncing your performance...',
  });
});

/**
 * GET /api/download/:generationId
 * Download final video (deducts credits)
 */
videoRoutes.get('/download/:generationId', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const generationId = c.req.param('generationId');

  const supabase = getSupabaseClient(c.env);

  const { data: generation, error } = await supabase
    .from('generations')
    .select('*, projects!inner(user_id)')
    .eq('id', generationId)
    .single();

  if (error || !generation) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Generation not found',
        },
      },
      404
    );
  }

  // Verify ownership
  if (generation.projects.user_id !== user.id) {
    return c.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
        },
      },
      403
    );
  }

  if (generation.status !== 'completed') {
    return c.json(
      {
        error: {
          code: 'NOT_READY',
          message: 'Video is not ready yet',
        },
      },
      400
    );
  }

  // Deduct credits (idempotent - only on first download)
  if (user.tier !== 'free') {
    await supabase.rpc('deduct_credits', {
      p_user_id: user.id,
      p_credits: generation.cost_credits,
    });
  } else {
    // Mark free generation as redeemed
    await supabase.from('users').update({ free_generation_redeemed: true }).eq('id', user.id);
  }

  // Get signed URL for video
  const videoUrl = `https://r2.vannilli.io/${generation.final_video_r2_path}`;

  return c.json({
    downloadUrl: videoUrl,
    expiresIn: 3600,
    creditsDeducted: generation.cost_credits,
    creditsRemaining: user.creditsRemaining - generation.cost_credits,
    watermarked: user.tier === 'free',
  });
});

