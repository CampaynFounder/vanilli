# Supabase Setup Guide for Email Collections

This guide will help you set up Supabase to store email collections from the pre-launch signup form.

## Step 1: Create Supabase Project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Fill in:
   - **Name**: `vannilli-production` (or your preferred name)
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Choose closest to your users (US East recommended)
   - **Pricing Plan**: Free tier is fine for development

## Step 2: Apply Database Schema

1. In your Supabase dashboard, go to **SQL Editor**
2. Open the file: `packages/database/schema.sql`
3. Copy the entire contents
4. Paste into the SQL Editor
5. Click **Run** to execute the schema

This will create:
- All existing tables (users, projects, generations, etc.)
- **New `email_collections` table** for pre-launch signups
- Indexes and RLS policies

### Step 2.1: Fix RLS Policy (If Getting 42501 Errors)

If you get "row-level security policy" errors when submitting emails:

1. Go to **SQL Editor** in Supabase
2. Open the file: `packages/database/fix-email-collections-rls.sql`
3. Copy and paste the contents
4. Click **Run**

This will fix the RLS policy to allow anonymous users to insert emails.

## Step 3: Get API Credentials

1. In Supabase dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

## Step 4: Configure Environment Variables

1. In `apps/web/`, create a `.env.local` file (if it doesn't exist):

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

2. Replace the placeholder values with your actual Supabase credentials

## Step 5: Verify Row-Level Security (RLS)

The `email_collections` table has RLS enabled:
- **Public inserts allowed**: Anyone can submit email/phone (for pre-launch signups)
- **Reads restricted**: Only admins can read (via service role key)

To view submissions:
1. Use the Supabase dashboard **Table Editor**
2. Or use the service role key in backend API calls

## Step 6: Test the Integration

1. Start your development server:
   ```bash
   cd apps/web
   npm run dev
   ```

2. Navigate to your site and trigger the signup modal
3. Submit a test email and phone number
4. Check Supabase dashboard → **Table Editor** → `email_collections` to verify the entry

## Troubleshooting

### Error: "Invalid API key"
- Verify your `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct
- Make sure you're using the **anon/public** key, not the service role key

### Error: "relation does not exist"
- The `email_collections` table wasn't created
- Re-run the schema.sql in Supabase SQL Editor

### Error: "duplicate key value violates unique constraint"
- This is expected behavior - the email already exists
- The form will show a friendly message to the user

### Can't see data in Supabase dashboard
- RLS policies prevent public reads
- Use the **Table Editor** in Supabase dashboard (bypasses RLS)
- Or use the service role key for programmatic access

## Production Deployment

When deploying to Cloudflare Pages:

1. Add environment variables in Cloudflare dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

2. These will be available at build time and runtime

## Querying Email Collections

To view all signups (using service role key):

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key
);

const { data, error } = await supabase
  .from('email_collections')
  .select('*')
  .order('created_at', { ascending: false });
```

## Next Steps

- Set up email notifications when new signups are collected
- Export data to CSV for marketing campaigns
- Integrate with email marketing tools (Mailchimp, ConvertKit, etc.)

