# Vannilli Deployment Guide

Complete guide for deploying Vannilli to production.

## Prerequisites

### Accounts Required
1. ✅ **Cloudflare Account** (for Workers, Pages, R2, D1, Queues)
2. ✅ **Supabase Account** (for PostgreSQL database)
3. ✅ **Stripe Account** (for payments)
4. ✅ **Kling AI Account** (for video generation API)
5. ✅ **GitHub Account** (for CI/CD)
6. ✅ **Domain** (vannilli.xaino.io)

### Tools Required
- Node.js 20+
- npm 10+
- Wrangler CLI (`npm install -g wrangler`)
- Supabase CLI (`brew install supabase/tap/supabase`)

## Step 1: Database Setup (Supabase)

### 1.1 Create Supabase Project
```bash
# Go to https://supabase.com/dashboard
# Click "New Project"
# Name: vannilli-production
# Region: US East (closest to Cloudflare)
# Plan: Pro ($25/month)
```

### 1.2 Apply Database Schema
```bash
cd packages/database
# Copy schema.sql contents
# Paste into Supabase SQL Editor
# Run query
```

### 1.3 Enable Row-Level Security
```bash
# All tables have RLS enabled in schema
# Verify in Supabase Dashboard > Authentication > Policies
```

### 1.4 Get Connection Details
```bash
# Save these for environment variables:
# SUPABASE_URL: https://[project-ref].supabase.co
# SUPABASE_SERVICE_KEY: [service_role key from API settings]
# SUPABASE_ANON_KEY: [anon public key]
```

## Step 2: Cloudflare Setup

### 2.1 Create R2 Buckets
```bash
# Login to Wrangler
wrangler login

# Create production buckets
wrangler r2 bucket create vannilli-raw-uploads
wrangler r2 bucket create vannilli-final-renders

# Set lifecycle rules (auto-delete raw uploads after 24h)
wrangler r2 bucket lifecycle create vannilli-raw-uploads \
  --expiration-days 1 \
  --prefix "driver-videos/"

wrangler r2 bucket lifecycle create vannilli-raw-uploads \
  --expiration-days 1 \
  --prefix "target-images/"

# Keep final renders for 30 days
wrangler r2 bucket lifecycle create vannilli-final-renders \
  --expiration-days 30 \
  --prefix "videos/"
```

### 2.2 Create D1 Database (Caching)
```bash
wrangler d1 create vannilli-cache

# Copy database_id from output
# Update wrangler.toml with database_id
```

### 2.3 Create Queues
```bash
wrangler queues create video-generation-queue
```

### 2.4 Set Secrets
```bash
cd apps/workers

# Set production secrets
wrangler secret put SUPABASE_SERVICE_KEY --env production
# Paste service key when prompted

wrangler secret put KLING_API_KEY --env production
# Paste Kling API key

wrangler secret put STRIPE_SECRET_KEY --env production
# Paste Stripe secret key (sk_live_...)

wrangler secret put STRIPE_WEBHOOK_SECRET --env production
# Paste Stripe webhook secret (whsec_...)

wrangler secret put SENTRY_DSN --env production
# Optional: Paste Sentry DSN for error tracking
```

## Step 3: Stripe Setup

### 3.1 Create Products
```bash
# Go to https://dashboard.stripe.com/products
# Create products:

1. Open Mic
   - Name: "Vannilli Open Mic"
   - Price: $15 (one-time payment)
   - Copy price ID: price_open_mic

2. Artist
   - Name: "Vannilli Artist"
   - Price: $20/month (recurring)
   - Copy price ID: price_artist

3. Label
   - Name: "Vannilli Label"
   - Price: $50/month (recurring)
   - Copy price ID: price_label
```

### 3.2 Update Price IDs in Code
```typescript
// apps/workers/src/routes/payment.ts
const STRIPE_PRICES = {
  open_mic: { priceId: 'price_[your_id]', amount: 1500 },
  artist: { priceId: 'price_[your_id]', amount: 2000 },
  label: { priceId: 'price_[your_id]', amount: 5000 },
};
```

### 3.3 Configure Webhooks
```bash
# Go to https://dashboard.stripe.com/webhooks
# Add endpoint: https://api.vannilli.xaino.io/api/webhooks/stripe
# Select events:
#   - checkout.session.completed
#   - customer.subscription.created
#   - customer.subscription.updated
#   - customer.subscription.deleted
#   - invoice.payment_succeeded
#   - invoice.payment_failed
# Copy webhook signing secret
```

## Step 4: Deploy Backend (Cloudflare Workers)

### 4.1 Deploy Workers
```bash
cd apps/workers

# Deploy to production
wrangler deploy --env production

# Verify deployment
curl https://api.vannilli.xaino.io/api/health
```

### 4.2 Deploy Queue Consumer
```bash
# Update wrangler.toml for queue consumer
wrangler deploy src/queue/video-processor.ts --env production
```

## Step 5: Deploy Frontend (Cloudflare Pages)

### 5.1 Connect GitHub Repository
```bash
# Go to https://dash.cloudflare.com/pages
# Click "Create a project"
# Connect GitHub: vannilli/vannilli
# Branch: main
```

### 5.2 Configure Build Settings
```
Build command: npm run build:web
Build output directory: apps/web/out
Root directory: /
Node version: 20
```

### 5.3 Set Environment Variables
```bash
# In Cloudflare Pages > Settings > Environment Variables

NEXT_PUBLIC_API_URL=https://api.vannilli.xaino.io
NEXT_PUBLIC_SUPABASE_URL=[your_supabase_url]
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your_anon_key]
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
NEXT_PUBLIC_SENTRY_DSN=[optional]
```

### 5.4 Deploy
```bash
# Push to main branch triggers automatic deployment
git push origin main

# Or manual deployment
cd apps/web
npm run build
wrangler pages publish .next --project-name vannilli-web
```

## Step 6: DNS Configuration

### 6.1 Add DNS Records
```bash
# In Cloudflare DNS settings:

# Frontend (Pages)
vannilli.xaino.io → CNAME → vannilli-web.pages.dev

# Backend (Workers)
api.vannilli.xaino.io → CNAME → [worker-subdomain].workers.dev

# Enable "Proxied" (orange cloud) for both
```

### 6.2 SSL/TLS Settings
```bash
# SSL/TLS mode: Full (strict)
# Enable HSTS
# Enable Automatic HTTPS Rewrites
```

## Step 7: Monitoring & Alerts

### 7.1 Sentry Setup (Optional)
```bash
# Go to https://sentry.io
# Create project: vannilli
# Copy DSN
# Add to environment variables (already done in Step 4.2 and 5.3)
```

### 7.2 Cloudflare Analytics
```bash
# Enable in Cloudflare Dashboard > Analytics
# Workers Analytics
# Pages Analytics
# R2 Metrics
```

### 7.3 Cost Monitoring Alert
```bash
# Create Slack webhook for alerts
# Update apps/workers/src/routes/admin.ts with webhook URL

# Set up daily cron trigger (in Cloudflare Dashboard):
# Trigger: 0 8 * * * (8am UTC daily)
# Script: Call /api/metrics and check margin
```

## Step 8: Testing Production

### 8.1 Smoke Tests
```bash
# 1. Health check
curl https://api.vannilli.xaino.io/api/health

# 2. Frontend loads
open https://vannilli.xaino.io

# 3. Signup flow
# Go to https://vannilli.xaino.io/auth/signup
# Create test account

# 4. Payment flow (Stripe test mode)
# Use card: 4242 4242 4242 4242
# Subscribe to Artist tier

# 5. Video generation (manual test)
# Create project, upload assets, generate video
```

### 8.2 E2E Tests
```bash
cd apps/web
npm run test:e2e
```

## Step 9: Go-Live Checklist

### Pre-Launch
- [ ] All environment variables set
- [ ] Database schema applied
- [ ] Stripe products created
- [ ] Webhooks configured
- [ ] DNS pointing to Cloudflare
- [ ] SSL certificates active
- [ ] Monitoring enabled
- [ ] Legal pages published (ToS, Privacy)
- [ ] Test transactions successful

### Post-Launch
- [ ] Monitor error rates (Sentry)
- [ ] Check webhook deliveries (Stripe)
- [ ] Verify video generations working
- [ ] Monitor costs (Kling API)
- [ ] Check margin > 40%
- [ ] Collect user feedback

## Step 10: Ongoing Maintenance

### Daily
- Check Sentry for new errors
- Monitor Cloudflare Analytics
- Review Kling API usage

### Weekly
- Review user feedback
- Check margin in /api/metrics
- Analyze conversion rates

### Monthly
- Review and optimize costs
- Update dependencies
- Security patches
- Feature planning

## Rollback Procedure

### Frontend Rollback
```bash
# In Cloudflare Pages > Deployments
# Find previous successful deployment
# Click "Rollback to this deployment"
```

### Backend Rollback
```bash
cd apps/workers
git checkout [previous-commit]
wrangler deploy --env production
```

### Database Rollback
```bash
# Restore from Supabase backup
# Dashboard > Database > Backups > Restore
```

## Troubleshooting

### Workers Not Responding
```bash
# Check logs
wrangler tail --env production

# Verify environment variables
wrangler secret list --env production
```

### Database Connection Issues
```bash
# Test Supabase connection
curl -H "apikey: [anon_key]" [supabase_url]/rest/v1/users

# Check RLS policies if queries fail
```

### Stripe Webhook Failures
```bash
# Check webhook logs in Stripe Dashboard
# Verify signing secret matches
# Test with Stripe CLI:
stripe listen --forward-to https://api.vannilli.xaino.io/api/webhooks/stripe
```

### Kling API Errors
```bash
# Check Kling API status
# Verify API key valid
# Check rate limits
# Review queue message format
```

## Cost Optimization Tips

1. **R2 Lifecycle Rules**: Ensure auto-deletion working
2. **Database**: Use connection pooling, optimize queries
3. **Workers**: Minimize cold starts, use caching
4. **Kling**: Batch requests where possible
5. **Monitoring**: Set up cost alerts (margin < 40%)

## Security Best Practices

1. **Secrets**: Never commit secrets to git
2. **RLS**: Verify policies working
3. **Rate Limiting**: Monitor for abuse
4. **Device Fingerprinting**: Check duplicate accounts
5. **Payment**: PCI compliance via Stripe
6. **Content Moderation**: Review reported content
7. **Regular Audits**: Quarterly security review

## Support Contacts

- **Cloudflare Support**: https://dash.cloudflare.com/support
- **Supabase Support**: support@supabase.com
- **Stripe Support**: https://support.stripe.com
- **Kling Support**: [Contact via platform]

---

**Deployment Completed!** 🎉

Next: Monitor for 48 hours, then announce launch.

