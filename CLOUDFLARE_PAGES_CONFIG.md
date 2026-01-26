# Cloudflare Pages Configuration Checklist

## Before Redeploying Frontend

### 1. Environment Variables (Required)

Go to: **Cloudflare Dashboard → Pages → Your Project → Settings → Environment Variables**

#### Existing Variables (Verify These Are Set):
```
NEXT_PUBLIC_SUPABASE_URL=https://[your-project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_[your-key]
```

#### New Variables (Add These):
```
NEXT_PUBLIC_MODAL_PROCESS_VIDEO_URL=https://[username]--vannilli-process-video-api.modal.run
```

**Note:** This is for the legacy single-chunk processing endpoint. Get the URL after deploying `modal_app/process_video.py`.

---

### 2. Supabase Edge Function Secrets (Not Cloudflare)

These are configured in **Supabase Dashboard**, not Cloudflare:

Go to: **Supabase Dashboard → Edge Functions → Settings → Secrets**

#### Required Secrets:
```
MODAL_ANALYZER_URL=https://[username]--vannilli-media-analyzer-api.modal.run
```

**Note:** Get this URL after deploying `modal_app/media_analyzer.py`.

---

### 3. DNS Configuration (If Not Already Set)

Go to: **Cloudflare Dashboard → DNS → Records**

#### Required Records:
```
Type: CNAME
Name: vannilli.xaino.io (or your domain)
Target: [your-pages-project].pages.dev
Proxy: ✅ Enabled (orange cloud)
```

---

### 4. Build Settings (Verify)

Go to: **Cloudflare Pages → Your Project → Settings → Builds & deployments**

#### Build Configuration:
```
Build command: npm run build:web
Build output directory: apps/web/out
Root directory: /
Node version: 20
```

---

### 5. SSL/TLS Settings (Verify)

Go to: **Cloudflare Dashboard → SSL/TLS**

#### Settings:
```
SSL/TLS encryption mode: Full (strict)
Always Use HTTPS: ✅ Enabled
Automatic HTTPS Rewrites: ✅ Enabled
```

---

## Step-by-Step Configuration

### Step 1: Deploy Modal Functions First

```bash
# Deploy Media Analyzer
python3 -m modal deploy modal_app/media_analyzer.py
# Copy the webhook URL from output → Set as MODAL_ANALYZER_URL in Supabase

# Deploy Process Video (legacy)
python3 -m modal deploy modal_app/process_video.py
# Copy the webhook URL from output → Set as NEXT_PUBLIC_MODAL_PROCESS_VIDEO_URL in Cloudflare Pages

# Deploy Worker Loop
python3 -m modal deploy modal_app/worker_loop.py
```

### Step 2: Set Supabase Edge Function Secret

1. Go to **Supabase Dashboard → Edge Functions → Settings → Secrets**
2. Click **"Add new secret"**
3. Key: `MODAL_ANALYZER_URL`
4. Value: `https://[username]--vannilli-media-analyzer-api.modal.run` (from Step 1)
5. Click **"Save"**

### Step 3: Set Cloudflare Pages Environment Variable

1. Go to **Cloudflare Dashboard → Pages → Your Project → Settings → Environment Variables**
2. Click **"Add variable"**
3. Key: `NEXT_PUBLIC_MODAL_PROCESS_VIDEO_URL`
4. Value: `https://[username]--vannilli-process-video-api.modal.run` (from Step 1)
5. Environment: **Production** (and Preview if needed)
6. Click **"Save"**

### Step 4: Trigger New Deployment

After setting environment variables, you need to trigger a new build:

**Option A: Via Git Push**
```bash
git commit --allow-empty -m "Trigger Cloudflare Pages rebuild"
git push origin main
```

**Option B: Via Cloudflare Dashboard**
1. Go to **Cloudflare Pages → Your Project → Deployments**
2. Click **"Retry deployment"** on the latest deployment
3. Or click **"Create deployment"** → Select branch → **"Deploy"**

---

## Verification Checklist

After redeploying, verify:

- [ ] Frontend loads at `https://vannilli.xaino.io`
- [ ] Studio page shows multi-image upload for DEMO/Industry tiers
- [ ] Studio page shows single image upload for lower tiers
- [ ] Audio upload accepts WAV, MP3, and MP4 formats
- [ ] Duration validation works (DEMO: 20s, Industry: 90s, others: 9s)
- [ ] Video generation creates `video_jobs` entry in database
- [ ] For DEMO/Industry: Job status changes to `ANALYZED` after analysis
- [ ] History page shows individual chunks for multi-chunk jobs

---

## Troubleshooting

### Environment Variables Not Working

**Problem:** Changes not reflected after deployment

**Solution:**
1. Verify variables are set in **Production** environment (not just Preview)
2. Trigger a new deployment (variables are embedded at build time)
3. Check build logs in Cloudflare Pages → Deployments → [Latest] → Build logs

### Modal URLs Not Working

**Problem:** 404 or connection errors

**Solution:**
1. Verify Modal functions are deployed: `python3 -m modal app list`
2. Check Modal function logs: `python3 -m modal app logs vannilli-media-analyzer`
3. Verify URLs are correct (no trailing slashes)
4. Check Modal function is not paused/sleeping

### Supabase Edge Function Not Calling Modal

**Problem:** `dispatch-job` not triggering analysis

**Solution:**
1. Verify `MODAL_ANALYZER_URL` is set in Supabase Edge Function secrets
2. Check Edge Function logs: **Supabase Dashboard → Edge Functions → Logs**
3. Verify database webhook is configured to call `dispatch-job` on `video_jobs` INSERT

---

## Quick Reference

### Modal Function URLs Format:
```
https://[username]--[app-name]-api.modal.run
```

### Where to Set Variables:

| Variable | Location | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_MODAL_PROCESS_VIDEO_URL` | **Cloudflare Pages** → Environment Variables | Frontend calls legacy processing |
| `MODAL_ANALYZER_URL` | **Supabase** → Edge Functions → Secrets | `dispatch-job` calls analyzer |
| `NEXT_PUBLIC_SUPABASE_URL` | **Cloudflare Pages** → Environment Variables | Frontend connects to Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Cloudflare Pages** → Environment Variables | Frontend auth |

---

**Ready to deploy?** Follow the steps above, then push to main branch or trigger manual deployment.
