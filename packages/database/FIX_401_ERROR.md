# Fix 401 Unauthorized Error

You're getting **401 Unauthorized** which means the Supabase anon key isn't being sent correctly or wasn't embedded in the build.

## Root Cause

With Next.js static export (`output: 'export'`), environment variables are embedded at **build time**. If the variables weren't set when Cloudflare Pages built your site, they won't be available at runtime.

## Step-by-Step Fix

### Step 1: Check Current Status

1. Visit: `https://your-domain.com/debug`
2. Check if it shows:
   - ✅ Variables are set in the build
   - ❌ Supabase is not configured in this build

### Step 2: Set Environment Variables in Cloudflare Pages

1. Go to **Cloudflare Dashboard** → **Pages** → Your Project
2. Click **Settings** → **Environment Variables**
3. Add these for **Production** environment:

```
NEXT_PUBLIC_SUPABASE_URL = https://veencpuzmhecmrubjxjk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ... (your full anon key)
```

**Important**: 
- Use the **anon/public** key (starts with `eyJ`)
- NOT the service_role key
- Get it from Supabase Dashboard → Settings → API

### Step 3: Trigger a New Deployment

**This is critical!** The build must run WITH the environment variables available.

**Option A: Retry Latest Deployment**
1. Go to **Deployments** tab
2. Click the **three dots** (⋯) on the latest deployment
3. Click **Retry deployment**

**Option B: Push a Commit**
```bash
git commit --allow-empty -m "Trigger rebuild with env vars"
git push origin main
```

### Step 4: Verify the Build

1. Wait for the deployment to complete
2. Visit `https://your-domain.com/debug` again
3. Should now show: ✅ Variables are set in the build

### Step 5: Check Browser Console

Open DevTools (F12) → Console and look for:

```
Supabase Config Check: {
  hasUrl: true,
  hasKey: true,
  urlLength: 45,
  keyLength: 200,
  ...
}
```

If you see `hasUrl: false` or `hasKey: false`, the variables still aren't embedded.

### Step 6: Check Network Request

1. Open DevTools → **Network** tab
2. Submit the email form
3. Find the POST request to `email_collections`
4. Check **Request Headers**:

Should include:
```
apikey: eyJ... (your anon key)
Authorization: Bearer eyJ... (same anon key)
```

If these headers are missing or show placeholder values, the env vars weren't embedded.

## Common Mistakes

1. **Set variables but didn't redeploy** → Must trigger new deployment
2. **Using service_role key** → Must use anon/public key
3. **Variables set for wrong environment** → Must set for Production
4. **Typo in variable name** → Must be exactly `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Still Getting 401?

1. Double-check the anon key in Supabase Dashboard → Settings → API
2. Copy it exactly (no extra spaces, full key)
3. Set it in Cloudflare Pages again
4. Trigger a new deployment
5. Clear browser cache and hard refresh (Cmd/Ctrl + Shift + R)

## Quick Test

After redeploying, check the browser console for the "Supabase Config Check" log. If it shows the variables, the client should work. If not, the build didn't pick them up.


