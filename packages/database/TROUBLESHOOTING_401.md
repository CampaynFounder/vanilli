# Troubleshooting 401 Unauthorized Error

If you're getting a `401 Unauthorized` error when submitting the email form, follow these steps:

## Step 1: Verify Environment Variables in Cloudflare Pages

1. Go to **Cloudflare Dashboard** → **Pages** → Your Project → **Settings** → **Environment Variables**
2. Ensure these are set for **Production** (and Preview if needed):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://veencpuzmhecmrubjxjk.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = Your anon key (starts with `eyJ...`)

3. **Important**: After setting/changing variables, you **MUST trigger a new deployment**:
   - Go to **Deployments** tab
   - Click **Retry deployment** on the latest deployment, OR
   - Push a small commit to trigger a new build

## Step 2: Verify Supabase Anon Key

1. Go to **Supabase Dashboard** → Your Project → **Settings** → **API**
2. Copy the **anon/public** key (NOT the service_role key)
3. It should:
   - Start with `eyJ` (JWT format)
   - Be very long (100+ characters)
   - Be labeled as "anon" or "public" key

## Step 3: Check Browser Console

Open browser DevTools (F12) → Console tab and look for:

```
Supabase Config Check: {
  hasUrl: true,
  hasKey: true,
  urlLength: 45,
  keyLength: 200,
  ...
}
```

If you see `hasUrl: false` or `hasKey: false`, the environment variables weren't embedded at build time.

## Step 4: Verify RLS Policy Includes 'anon' Role

Run this SQL in Supabase SQL Editor:

```sql
-- Check current policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'email_collections';
```

You should see `roles: {anon, authenticated, public}` for the INSERT policy.

If not, run:

```sql
-- Fix: Add 'anon' role
DROP POLICY IF EXISTS email_collections_insert_public ON email_collections;

CREATE POLICY email_collections_insert_public ON email_collections 
  FOR INSERT 
  TO anon, authenticated, public
  WITH CHECK (true);
```

## Step 5: Test with Debug Page

Visit: `https://your-domain.com/debug`

This page shows:
- Whether env vars are set
- Whether they're valid format
- Overall configuration status

## Step 6: Common Issues

### Issue: "Variables are set but still getting 401"

**Solution**: Variables must be set **before** the build runs. For static export, env vars are embedded at build time.

1. Set variables in Cloudflare Pages
2. Trigger a new deployment (retry or push a commit)
3. Wait for build to complete
4. Test again

### Issue: "Using wrong key"

**Solution**: Make sure you're using the **anon/public** key, NOT the service_role key.

- ✅ **anon key**: Safe for frontend, starts with `eyJ`, used for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ❌ **service_role key**: Only for backend, bypasses RLS, should NEVER be in frontend code

### Issue: "RLS policy doesn't allow anon"

**Solution**: Run the fix script from `packages/database/fix-email-collections-rls-anon.sql`

## Step 7: Verify Request Headers

In browser DevTools → Network tab → Find the POST request to `email_collections`:

**Request Headers should include:**
```
apikey: eyJ... (your anon key)
Authorization: Bearer eyJ... (same anon key)
```

If these headers are missing or wrong, the Supabase client isn't configured correctly.

## Still Not Working?

1. Check Supabase project is active (not paused)
2. Verify the table exists: `SELECT * FROM email_collections LIMIT 1;`
3. Check Supabase logs: Dashboard → Logs → API Logs
4. Verify the URL matches exactly (no trailing slashes)


