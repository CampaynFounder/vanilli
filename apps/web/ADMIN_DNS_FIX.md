# Fix: ERR_NAME_NOT_RESOLVED for API

## Problem
The admin dashboard can't reach `https://api.vannilli.xaino.io` because DNS isn't configured.

## Solution Options

### Option 1: Use Workers.dev Subdomain (Quick Fix)

1. **Find your Worker's subdomain**:
   - Go to Cloudflare Dashboard → Workers & Pages
   - Click on your `vannilli-api` worker
   - Look for the URL (e.g., `vannilli-api.your-account.workers.dev`)

2. **Update Cloudflare Pages Environment Variable**:
   - Go to Cloudflare Pages → Your Project → Settings → Environment Variables
   - Update `NEXT_PUBLIC_API_URL` to: `https://vannilli-api.your-account.workers.dev`
   - Replace `your-account` with your actual account subdomain

3. **Trigger new deployment**

### Option 2: Set Up Custom Domain DNS (Proper Fix)

1. **In Cloudflare DNS**:
   - Go to DNS → Records
   - Add a new CNAME record:
     - Name: `api`
     - Target: `vannilli-api.your-account.workers.dev` (or your worker's subdomain)
     - Proxy status: Proxied (orange cloud) ✅

2. **In Cloudflare Workers**:
   - Go to Workers & Pages → vannilli-api → Settings → Triggers
   - Add Custom Domain: `api.vannilli.xaino.io`
   - Cloudflare will automatically configure SSL

3. **Wait for DNS propagation** (usually 1-5 minutes)

4. **Verify**:
   ```bash
   curl https://api.vannilli.xaino.io/api/health
   ```

### Option 3: Temporary Workaround (Direct Supabase)

If you need immediate access, I can modify the admin page to call Supabase directly using the anon key (but this won't work because anon key can't SELECT from email_collections due to RLS). So this isn't viable.

## Recommended: Use Option 1 First

Use the workers.dev subdomain for now, then set up the custom domain (Option 2) when ready.

## Finding Your Worker URL

1. Go to: https://dash.cloudflare.com
2. Click: **Workers & Pages**
3. Click on: **vannilli-api**
4. Look for the URL in the overview (e.g., `https://vannilli-api.abc123.workers.dev`)

Use that URL as your `NEXT_PUBLIC_API_URL` in Cloudflare Pages.

