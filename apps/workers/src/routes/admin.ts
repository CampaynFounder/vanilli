/**
 * Admin and monitoring routes
 */

import { Hono } from 'hono';
import { requireAuth, getSupabaseClient } from '../lib/auth';
import { KLING_COST_PER_SEC } from '@vannilli/music-calculator';
import type { Env, AuthUser } from '../types';

export const adminRoutes = new Hono<{ Bindings: Env }>();

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

