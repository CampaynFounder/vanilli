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

/**
 * GET /api/auth/profile
 * Get user profile with referral code and avatar
 */
authRoutes.get('/profile', async (c) => {
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

  // Get full user data including avatar
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('email, tier, credits_remaining, free_generation_redeemed, device_fingerprint, avatar_url, created_at')
    .eq('id', user.id)
    .single();

  if (userError || !userData) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
        },
      },
      404
    );
  }

  // Get or generate referral code
  let referralCode = '';
  const { data: existingReferral } = await supabase
    .from('referrals')
    .select('referral_code')
    .eq('referrer_user_id', user.id)
    .limit(1)
    .single();

  if (existingReferral) {
    referralCode = existingReferral.referral_code;
  } else {
    // Generate new referral code: VANNI-{first 8 chars of user ID}
    referralCode = `VANNI-${user.id.substring(0, 8).toUpperCase()}`;
  }

  // Get subscription info
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, current_period_end, tier')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single();

  return c.json({
    id: user.id,
    email: userData.email,
    tier: userData.tier,
    creditsRemaining: userData.credits_remaining,
    freeGenerationRedeemed: userData.free_generation_redeemed,
    avatarUrl: userData.avatar_url,
    referralCode,
    createdAt: userData.created_at,
    subscription: subscription
      ? {
          status: subscription.status,
          tier: subscription.tier,
          currentPeriodEnd: subscription.current_period_end,
        }
      : null,
  });
});

/**
 * PUT /api/auth/profile
 * Update user profile (avatar URL)
 */
authRoutes.put('/profile', async (c) => {
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

  const { avatarUrl } = await c.req.json();

  const supabase = getSupabaseClient(c.env);

  const { error } = await supabase
    .from('users')
    .update({ avatar_url: avatarUrl })
    .eq('id', user.id);

  if (error) {
    return c.json(
      {
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update profile',
        },
      },
      500
    );
  }

  return c.json({ success: true, avatarUrl });
});

/**
 * GET /api/auth/referrals
 * Get referral stats and referred users list
 */
authRoutes.get('/referrals', async (c) => {
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

  // Get all referrals by this user
  const { data: referrals, error } = await supabase
    .from('referrals')
    .select('id, referred_user_id, referral_code, credits_awarded, status, referred_product, created_at, completed_at')
    .eq('referrer_user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return c.json(
      {
        error: {
          code: 'QUERY_FAILED',
          message: 'Failed to fetch referrals',
        },
      },
      500
    );
  }

  // Calculate stats
  const totalReferrals = referrals?.length || 0;
  const completedReferrals = referrals?.filter((r) => r.status === 'completed').length || 0;
  const totalCreditsEarned = referrals?.reduce((sum, r) => sum + r.credits_awarded, 0) || 0;
  const pendingReferrals = referrals?.filter((r) => r.status === 'pending').length || 0;

  // Get referred users emails (for display)
  const referredUserIds = referrals?.map((r) => r.referred_user_id).filter(Boolean) || [];
  let referredUsers = [];

  if (referredUserIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, email, tier, created_at')
      .in('id', referredUserIds);

    referredUsers = users || [];
  }

  // Combine referral data with user info
  const referralsList = referrals?.map((referral) => {
    const referredUser = referredUsers.find((u) => u.id === referral.referred_user_id);
    return {
      id: referral.id,
      referralCode: referral.referral_code,
      creditsAwarded: referral.credits_awarded,
      status: referral.status,
      referredProduct: referral.referred_product,
      createdAt: referral.created_at,
      completedAt: referral.completed_at,
      referredUser: referredUser
        ? {
            email: referredUser.email,
            tier: referredUser.tier,
            signedUpAt: referredUser.created_at,
          }
        : null,
    };
  }) || [];

  return c.json({
    stats: {
      totalReferrals,
      completedReferrals,
      pendingReferrals,
      totalCreditsEarned,
    },
    referrals: referralsList,
  });
});


