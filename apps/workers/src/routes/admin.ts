/**
 * Admin and monitoring routes
 */

import { Hono } from 'hono';
import { requireAuth, getSupabaseClient } from '../lib/auth';
import { KLING_COST_PER_SEC } from '@vannilli/music-calculator';
import type { Env, AuthUser } from '../types';

export const adminRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /api/admin/verify-password
 * Verify admin password for dashboard access
 */
adminRoutes.post('/admin/verify-password', async (c) => {
  const { password } = await c.req.json();
  const adminPassword = c.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return c.json({ error: 'Admin password not configured' }, 500);
  }

  if (password === adminPassword) {
    return c.json({ success: true });
  }

  return c.json({ error: 'Invalid password' }, 401);
});

/**
 * GET /api/admin/email-collections
 * Get all email collections with stats (password-protected)
 */
adminRoutes.get('/admin/email-collections', async (c) => {
  // Simple password check via header (for API calls)
  const authHeader = c.req.header('Authorization');
  const adminPassword = c.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return c.json({ error: 'Admin password not configured' }, 500);
  }

  if (authHeader !== `Bearer ${adminPassword}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const supabase = getSupabaseClient(c.env);

  // Get all email collections
  const { data, error } = await supabase
    .from('email_collections')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  const total = data?.length || 0;
  
  // Calculate last 24 hours
  const now = new Date();
  const last24Hours = data?.filter(item => {
    const itemDate = new Date(item.created_at);
    const diffHours = (now.getTime() - itemDate.getTime()) / (1000 * 60 * 60);
    return diffHours <= 24;
  }).length || 0;

  // Get investors (priority contacts)
  const investors = data?.filter(item => item.is_investor === true) || [];

  // Calculate weekly trend (last 7 days)
  const weeklyTrend: Array<{ date: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    
    const count = data?.filter(item => {
      const itemDate = new Date(item.created_at);
      return itemDate >= date && itemDate < nextDate;
    }).length || 0;
    
    weeklyTrend.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count,
    });
  }

  return c.json({
    data: data || [],
    total,
    last24Hours,
    investors,
    weeklyTrend,
  });
});

/**
 * GET /api/admin/referral-rewards
 * Get referral rewards configuration
 */
adminRoutes.get('/admin/referral-rewards', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;

  // Simple admin check - label tier only (TODO: add proper admin role)
  if (user.tier !== 'label') {
    return c.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      },
      403
    );
  }

  const supabase = getSupabaseClient(c.env);

  const { data, error } = await supabase
    .from('referral_rewards')
    .select('*')
    .order('referrer_tier, referred_product');

  if (error) {
    return c.json(
      {
        error: {
          code: 'QUERY_FAILED',
          message: 'Failed to fetch referral rewards',
        },
      },
      500
    );
  }

  return c.json({ rewards: data || [] });
});

/**
 * PUT /api/admin/referral-rewards
 * Update referral reward amounts (batch update)
 */
adminRoutes.put('/admin/referral-rewards', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;

  // Simple admin check - label tier only
  if (user.tier !== 'label') {
    return c.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      },
      403
    );
  }

  const { rewards } = await c.req.json();

  if (!Array.isArray(rewards)) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'rewards must be an array',
        },
      },
      400
    );
  }

  const supabase = getSupabaseClient(c.env);

  // Update each reward
  const updates = rewards.map(async (reward: { referrer_tier: string; referred_product: string; credits_awarded: number }) => {
    return supabase
      .from('referral_rewards')
      .update({ credits_awarded: reward.credits_awarded })
      .eq('referrer_tier', reward.referrer_tier)
      .eq('referred_product', reward.referred_product);
  });

  await Promise.all(updates);

  return c.json({ success: true, updated: rewards.length });
});

/**
 * GET /api/metrics
 * Get cost monitoring metrics (admin only - simplified auth for now)
 */
adminRoutes.get('/metrics', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;

  // TODO: Add proper admin role check
  if (user.tier !== 'label') {
    return c.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      },
      403
    );
  }

  const supabase = getSupabaseClient(c.env);

  // Get today's metrics
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const { data: todayGenerations } = await supabase
    .from('generations')
    .select('cost_credits')
    .eq('status', 'completed')
    .gte('created_at', startOfToday.toISOString());

  const todayCredits = todayGenerations?.reduce((sum, gen) => sum + gen.cost_credits, 0) || 0;
  const todayKlingCost = todayCredits * KLING_COST_PER_SEC;
  const todayRevenue = todayCredits * 0.25; // Average rate
  const todayMargin = todayRevenue - todayKlingCost;
  const todayMarginPercent = todayRevenue > 0 ? (todayMargin / todayRevenue) * 100 : 0;

  // Get this month's metrics
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: monthGenerations } = await supabase
    .from('generations')
    .select('cost_credits')
    .eq('status', 'completed')
    .gte('created_at', startOfMonth.toISOString());

  const monthCredits = monthGenerations?.reduce((sum, gen) => sum + gen.cost_credits, 0) || 0;
  const monthKlingCost = monthCredits * KLING_COST_PER_SEC;
  const monthRevenue = monthCredits * 0.25;
  const monthMargin = monthRevenue - monthKlingCost;
  const monthMarginPercent = monthRevenue > 0 ? (monthMargin / monthRevenue) * 100 : 0;

  return c.json({
    today: {
      klingCost: Number(todayKlingCost.toFixed(2)),
      revenue: Number(todayRevenue.toFixed(2)),
      margin: Number(todayMargin.toFixed(2)),
      marginPercent: Number(todayMarginPercent.toFixed(1)),
      generationsCount: todayGenerations?.length || 0,
    },
    thisMonth: {
      klingCost: Number(monthKlingCost.toFixed(2)),
      revenue: Number(monthRevenue.toFixed(2)),
      margin: Number(monthMargin.toFixed(2)),
      marginPercent: Number(monthMarginPercent.toFixed(1)),
      generationsCount: monthGenerations?.length || 0,
    },
  });
});

/**
 * POST /api/content-report
 * Report inappropriate content
 */
adminRoutes.post('/content-report', requireAuth, async (c) => {
  const user = c.get('user') as AuthUser;
  const { generationId, reason, description } = await c.req.json();

  if (!generationId || !reason) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Generation ID and reason are required',
        },
      },
      400
    );
  }

  const validReasons = ['copyright', 'inappropriate', 'spam', 'other'];
  if (!validReasons.includes(reason)) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid reason',
        },
      },
      400
    );
  }

  const supabase = getSupabaseClient(c.env);

  const { data: report, error } = await supabase
    .from('content_reports')
    .insert({
      reporter_user_id: user.id,
      reported_generation_id: generationId,
      reason,
      description,
      status: 'pending',
    })
    .select()
    .single();

  if (error || !report) {
    return c.json(
      {
        error: {
          code: 'CREATION_FAILED',
          message: 'Failed to submit report',
        },
      },
      500
    );
  }

  return c.json(
    {
      reportId: report.id,
      status: report.status,
      message: "Report submitted. We'll review within 24 hours.",
    },
    201
  );
});

