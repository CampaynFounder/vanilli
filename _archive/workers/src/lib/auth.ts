/**
 * Authentication utilities
 */

import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';
import type { Env, AuthUser } from '../types';

/**
 * Get Supabase client
 */
export function getSupabaseClient(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Extract JWT token from Authorization header
 */
function extractToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * Get authenticated user from JWT token
 */
export async function getAuthUser(c: Context<{ Bindings: Env }>): Promise<AuthUser | null> {
  const token = extractToken(c.req.header('Authorization'));
  if (!token) {
    return null;
  }

  const supabase = getSupabaseClient(c.env);

  try {
    // Verify JWT and get user
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    // Get user's tier and credits from database
    const { data: userData, error: dbError } = await supabase
      .from('users')
      .select('tier, credits_remaining, free_generation_redeemed')
      .eq('id', user.id)
      .single();

    if (dbError || !userData) {
      return null;
    }

    return {
      id: user.id,
      email: user.email!,
      tier: userData.tier,
      creditsRemaining: userData.credits_remaining,
      freeGenerationRedeemed: userData.free_generation_redeemed,
    };
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

/**
 * Require authentication middleware
 */
export async function requireAuth(c: Context<{ Bindings: Env }>, next: () => Promise<void>) {
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

  // Store user in context
  c.set('user', user);
  await next();
}


