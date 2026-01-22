/**
 * Vannilli API - Cloudflare Workers
 * 
 * Main entry point for all API routes
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env } from './types';

// Route handlers
import { authRoutes } from './routes/auth';
import { videoRoutes } from './routes/video';
import { paymentRoutes } from './routes/payment';
import { projectRoutes } from './routes/projects';
import { adminRoutes } from './routes/admin';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: [
      'https://vannilli.xaino.io',
      'http://localhost:3000', // Local development
    ],
    credentials: true,
  })
);

// Health check (no auth required)
app.get('/api/health', (c) => {
  return c.json({
    status: 'healthy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
  });
});

// Mount route handlers
app.route('/api/auth', authRoutes);
app.route('/api', videoRoutes);
app.route('/api', paymentRoutes);
app.route('/api/projects', projectRoutes);
app.route('/api', adminRoutes);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'The requested endpoint does not exist',
      },
    },
    404
  );
});

// Global error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);

  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: c.env.ENVIRONMENT === 'production' ? undefined : err.message,
      },
    },
    500
  );
});

export default app;

