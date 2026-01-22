/**
 * Authentication routes
 */

import { Hono } from 'hono';
import { getSupabaseClient, getAuthUser } from '../lib/auth';
import type { Env } from '../types';

export const authRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /api/auth/signup
 * Create new user account
 */
authRoutes.post('/signup', async (c) => {
  const { email, password, deviceFingerprint } = await c.req.json();

  // Validation
  if (!email || !password) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and password are required',
        },
      },
      400
    );
  }

  if (password.length < 8) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Password must be at least 8 characters',
        },
      },
      400
    );
  }

  const supabase = getSupabaseClient(c.env);

  // Check for duplicate device fingerprint (fraud prevention)
  if (deviceFingerprint) {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('device_fingerprint', deviceFingerprint)
      .single();

    if (existing) {
      return c.json(
        {
          error: {
            code: 'DUPLICATE_DEVICE',
            message: 'An account already exists from this device',
          },
        },
        400
      );
    }
  }

  // Create user in Supabase Auth
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        device_fingerprint: deviceFingerprint,
      },
    },
  });

  if (error) {
    return c.json(
      {
        error: {
          code: 'SIGNUP_FAILED',
          message: error.message,
        },
      },
      400
    );
  }

  if (!data.user || !data.session) {
    return c.json(
      {
        error: {
          code: 'SIGNUP_FAILED',
          message: 'Failed to create user',
        },
      },
      500
    );
  }

  // Create user record in database
  const { error: dbError } = await supabase.from('users').insert({
    id: data.user.id,
    email: data.user.email!,
    tier: 'free',
    credits_remaining: 0,
    device_fingerprint: deviceFingerprint,
  });

  if (dbError) {
    console.error('Failed to create user record:', dbError);
  }

  return c.json(
    {
      user: {
        id: data.user.id,
        email: data.user.email,
        tier: 'free',
        creditsRemaining: 0,
        freeGenerationRedeemed: false,
      },
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
      },
    },
    201
  );
});

/**
 * POST /api/auth/signin
 * Sign in existing user
 */
authRoutes.post('/signin', async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email and password are required',
        },
      },
      400
    );
  }

  const supabase = getSupabaseClient(c.env);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return c.json(
      {
        error: {
          code: 'SIGNIN_FAILED',
          message: 'Invalid email or password',
        },
      },
      401
    );
  }

  if (!data.user || !data.session) {
    return c.json(
      {
        error: {
          code: 'SIGNIN_FAILED',
          message: 'Failed to sign in',
        },
      },
      500
    );
  }

  // Get user data
  const { data: userData } = await supabase
    .from('users')
    .select('tier, credits_remaining, free_generation_redeemed')
    .eq('id', data.user.id)
    .single();

  return c.json({
    user: {
      id: data.user.id,
      email: data.user.email,
      tier: userData?.tier || 'free',
      creditsRemaining: userData?.credits_remaining || 0,
      freeGenerationRedeemed: userData?.free_generation_redeemed || false,
    },
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
    },
  });
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
authRoutes.get('/me', async (c) => {
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

  const supabase = getSupabaseClient(c.env);

  // Get subscription info if exists
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  return c.json({
    id: user.id,
    email: user.email,
    tier: user.tier,
    creditsRemaining: user.creditsRemaining,
    freeGenerationRedeemed: user.freeGenerationRedeemed,
    subscription: subscription
      ? {
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end,
        }
      : null,
  });
});

