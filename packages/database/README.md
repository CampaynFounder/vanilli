# Vannilli Database Package

Supabase PostgreSQL schema, migrations, and database utilities.

## Setup

### Local Development

1. Install Supabase CLI:
```bash
brew install supabase/tap/supabase
```

2. Initialize Supabase locally:
```bash
supabase init
supabase start
```

3. Apply schema:
```bash
supabase db reset
```

### Production

1. Create Supabase project at https://supabase.com
2. Run schema through Supabase dashboard SQL editor
3. Set environment variables in Cloudflare Workers

## Schema Overview

### Tables

- `users` - User accounts and credit balances
- `projects` - Music video projects (BPM, bars, assets)
- `generations` - AI generation jobs and results
- `subscriptions` - Stripe subscription tracking
- `audit_log` - User action logging for compliance
- `referrals` - Viral referral system
- `content_reports` - Content moderation

### Security

Row-Level Security (RLS) is enabled on all tables. Users can only access their own data.

### Functions

- `log_user_action()` - Log user actions for audit trail
- `deduct_credits()` - Atomically deduct credits with balance check
- `add_credits()` - Add credits to user account

## Migrations

Migrations are managed through Supabase CLI:

```bash
# Create new migration
supabase migration new migration_name

# Apply migrations
supabase db push

# Rollback
supabase db reset
```

## Backup & Recovery

- Automated daily backups (Supabase Pro)
- Point-in-Time Recovery (7 days)
- Manual backups via dashboard

## Monitoring

Query performance monitoring available in Supabase dashboard under "Database" → "Query Performance".

