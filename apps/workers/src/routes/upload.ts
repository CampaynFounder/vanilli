/**
 * Upload routes for user-generated content
 */

import { Hono } from 'hono';
import { getAuthUser } from '../lib/auth';
import type { Env } from '../types';

export const uploadRoutes = new Hono<{ Bindings: Env }>();

const ASSET_EXT: Record<string, string> = {
  driverVideo: 'mp4',
  targetImage: 'jpg',
  audio: 'mp3',
};

/**
 * POST /api/upload/studio-asset
 * Upload a Studio asset (tracking video, target image, or audio) to R2.
 * Headers: Authorization: Bearer <jwt>, X-Asset-Type: driverVideo | targetImage | audio
 * Body: raw binary (video/mp4, image/jpeg, audio/mpeg)
 * Returns: { key }
 */
uploadRoutes.post('/studio-asset', async (c) => {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
  }
  const assetType = c.req.header('X-Asset-Type');
  if (!assetType || !ASSET_EXT[assetType]) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'X-Asset-Type must be driverVideo, targetImage, or audio' } },
      400
    );
  }
  const ext = ASSET_EXT[assetType];
  const prefix =
    assetType === 'driverVideo' ? 'driver-videos' : assetType === 'targetImage' ? 'target-images' : 'audio';
  const key = `${prefix}/${user.id}/${crypto.randomUUID()}.${ext}`;

  const body = await c.req.arrayBuffer();
  if (!body || body.byteLength === 0) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Request body must be non-empty' } }, 400);
  }

  await c.env.RAW_UPLOADS.put(key, body);
  return c.json({ key });
});

/**
 * POST /api/upload/avatar
 * Get pre-signed URL for avatar upload to Supabase Storage
 * Client will upload directly to Supabase Storage, then update profile
 */
uploadRoutes.post('/avatar', async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      },
      401
    );
  }

  const { fileName, fileType } = await c.req.json();

  if (!fileName || !fileType) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'fileName and fileType are required',
        },
      },
      400
    );
  }

  // Validate file type (images only)
  if (!fileType.startsWith('image/')) {
    return c.json(
      {
        error: {
          code: 'INVALID_FILE_TYPE',
          message: 'Only image files are allowed',
        },
      },
      400
    );
  }

  // Generate unique file path
  const fileExtension = fileName.split('.').pop();
  const uniqueFileName = `${user.id}_${Date.now()}.${fileExtension}`;
  const storagePath = `avatars/${uniqueFileName}`;

  // Return the path for client-side upload to Supabase Storage
  // Client will use Supabase SDK to upload directly
  return c.json({
    storagePath,
    publicUrl: `${c.env.SUPABASE_URL}/storage/v1/object/public/user-avatars/${storagePath}`,
    message: 'Use Supabase Storage SDK to upload to this path',
  });
});
