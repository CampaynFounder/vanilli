# Still Getting 42501 Error? Follow These Steps

If you've run the SQL fix but are still getting the 42501 error, follow these troubleshooting steps:

## Step 1: Verify You're in the Right Project

1. Check your Supabase dashboard URL
2. Make sure you're running SQL in the **same project** that your Cloudflare Pages environment variables point to
3. Verify the project URL matches `NEXT_PUBLIC_SUPABASE_URL` in Cloudflare Pages

## Step 2: Run Diagnostic Query

Run this in Supabase SQL Editor to see the current state:

```sql
SELECT 
  policyname,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'email_collections';
```

**What to look for:**
- If `roles` shows `{public}` only → The fix didn't work, continue to Step 3
- If `roles` shows `{anon,authenticated,public}` → Policy is correct, but there's another issue (see Step 4)

## Step 3: Run the Complete Fix

Use the file: `packages/database/DIAGNOSE_AND_FIX.sql`

This script:
1. Shows current state
2. Drops ALL existing policies
3. Recreates with correct roles
4. Verifies it worked

**Important:** Run the entire script, not just parts of it.

## Step 4: Check for Other Issues

If the policy shows correct roles but you still get 42501:

### A. Check RLS is Enabled
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'email_collections';
```
Should show `rowsecurity = true`

### B. Check Table Exists
```sql
SELECT * FROM email_collections LIMIT 1;
```
If this errors, the table doesn't exist - run the full schema.sql

### C. Check Your Supabase Anon Key
1. Go to Supabase Dashboard → Settings → API
2. Copy the **anon/public** key (starts with `eyJ`)
3. Verify it matches `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Cloudflare Pages
4. **Important:** After changing env vars, trigger a new deployment

### D. Verify Environment Variables Are Set
1. Go to Cloudflare Pages → Your Project → Settings → Environment Variables
2. Check that both are set for **Production**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. **After setting/changing:** Trigger a new deployment (retry latest or push a commit)

## Step 5: Test with Direct SQL Insert

Try inserting directly in Supabase SQL Editor:

```sql
-- This should work if the policy is correct
INSERT INTO email_collections (email, phone, is_investor, source)
VALUES ('test@example.com', '555-1234', false, 'test');

-- Check it was inserted
SELECT * FROM email_collections WHERE email = 'test@example.com';

-- Clean up
DELETE FROM email_collections WHERE email = 'test@example.com';
```

- **If this works:** The policy is correct, the issue is with the frontend/client
- **If this fails:** The policy is still wrong, re-run the fix script

## Step 6: Check Browser Console

Open browser DevTools (F12) → Console and look for:

```
Supabase Config Check: {
  hasUrl: true,
  hasKey: true,
  ...
}
```

- If `hasUrl: false` or `hasKey: false` → Environment variables aren't set/embedded
- If both are `true` → Variables are set, check the actual values

## Step 7: Clear Cache and Retry

1. Hard refresh the page (Cmd/Ctrl + Shift + R)
2. Clear browser cache
3. Try submitting the form again

## Step 8: Check Supabase Logs

1. Go to Supabase Dashboard → Logs → API Logs
2. Look for the failed request
3. Check the error details

## Common Mistakes

1. **Running SQL in wrong project** - Make sure you're in the project that matches your env vars
2. **Not triggering new deployment** - After setting env vars, you MUST redeploy
3. **Using service_role key** - Must use anon/public key for frontend
4. **Policy syntax error** - Make sure you copy the entire SQL script
5. **RLS disabled** - Make sure `ALTER TABLE email_collections ENABLE ROW LEVEL SECURITY;` was run

## Still Not Working?

If you've tried all of the above:

1. Share the output of the diagnostic query (Step 2)
2. Share the browser console logs
3. Share the Supabase API logs for the failed request
4. Verify you're using the correct Supabase project


