/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
  // R2 Buckets
  RAW_UPLOADS: R2Bucket;
  FINAL_RENDERS: R2Bucket;

  // D1 Database
  CACHE: D1Database;

  // Queues
  VIDEO_QUEUE: Queue;

  // Environment variables
  ENVIRONMENT: string;
  SUPABASE_URL: string;
  KLING_API_URL: string;

  // Secrets
  SUPABASE_SERVICE_KEY: string;
  KLING_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  ADMIN_PASSWORD: string;
  SENTRY_DSN?: string;
}

/**
 * Supabase user from JWT
 */
export interface AuthUser {
  id: string;
  email: string;
  tier: 'free' | 'open_mic' | 'indie_artist' | 'artist' | 'label';
  creditsRemaining: number;
  freeGenerationRedeemed: boolean;
}

/**
 * API error response
 */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Video generation queue message
 */
export interface VideoGenerationMessage {
  internalTaskId: string;
  generationId: string;
  userId: string;
  driverVideoUrl: string;
  targetImageUrl: string;
  prompt?: string;
  mode?: 'standard' | 'pro';
}

