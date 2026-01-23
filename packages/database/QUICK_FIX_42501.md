# Quick Fix for 42501 RLS Policy Error

## Error Message
```
code: '42501'
message: 'new row violates row-level security policy for table "email_collections"'
```

## What This Means
The Row Level Security (RLS) policy on the `email_collections` table doesn't allow the `anon` role to insert rows. The frontend uses the `anon` role when making requests with the anon key.

## Quick Fix (2 minutes)

### Step 1: Open Supabase SQL Editor
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Click **SQL Editor** in the left sidebar

### Step 2: Run the Fix Script
1. Open the file: `packages/database/fix-email-collections-rls-anon.sql`
2. Copy the entire contents
3. Paste into the SQL Editor
4. Click **Run** (or press Cmd/Ctrl + Enter)

### Step 3: Verify It Worked
Run this query in the SQL Editor:

```sql
SELECT 
  policyname,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'email_collections';
```

**Expected Result:**
- `policyname`: `email_collections_insert_public`
- `roles`: `{anon,authenticated,public}` ✅
- `cmd`: `INSERT`

### Step 4: Test
Try submitting the email form again. The 42501 error should be gone.

## Why This Happens

When you use the Supabase anon key from the frontend:
- Supabase uses the `anon` role (not `public`)
- The RLS policy must explicitly allow `anon` role
- If the policy only allows `public` or `authenticated`, you'll get a 42501 error

## Still Getting Errors?

1. **Check if RLS is enabled:**
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE tablename = 'email_collections';
   ```
   Should show `rowsecurity = true`

2. **Check all policies:**
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'email_collections';
   ```

3. **Manually create the policy if needed:**
   ```sql
   DROP POLICY IF EXISTS email_collections_insert_public ON email_collections;
   
   CREATE POLICY email_collections_insert_public ON email_collections 
     FOR INSERT 
     TO anon, authenticated, public
     WITH CHECK (true);
   ```

4. **Verify your Supabase anon key:**
   - Go to Settings → API
   - Make sure you're using the **anon/public** key (starts with `eyJ`)
   - NOT the service_role key

