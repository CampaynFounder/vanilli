# Modal Deployment Commands

## Prerequisites

1. Install Modal CLI:
   ```bash
   pip install modal
   # or
   python3 -m pip install modal
   ```

2. Authenticate:
   ```bash
   modal setup
   ```

3. Ensure you have the `vannilli-secrets` Modal secret configured with:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `KLING_API_URL`
   - `KLING_ACCESS_KEY`
   - `KLING_SECRET_KEY` (or `KLING_API_KEY`)

## Deployment Commands

### 1. Deploy Media Analyzer (librosa + audalign)
```bash
python3 -m modal deploy modal_app/media_analyzer.py
```

This deploys:
- `analyze_media` function (for direct calls)
- `webhook` web endpoint (for Supabase Edge Function)

**After deployment:**
- Copy the webhook URL from the output
- Set `MODAL_ANALYZER_URL` in your Supabase Edge Function secrets

### 2. Deploy Worker Loop (queue processor)
```bash
python3 -m modal deploy modal_app/worker_loop.py
```

This deploys:
- `worker_loop` scheduled function (runs every 10 seconds)

**Note:** This function automatically polls the database for jobs using the `get_next_job()` RPC function.

### 3. Deploy Process Video (legacy single-chunk endpoint)
```bash
python3 -m modal deploy modal_app/process_video.py
```

This deploys:
- `process_video` web endpoint (for legacy lower-tier jobs)

**After deployment:**
- Copy the webhook URL from the output
- Set `NEXT_PUBLIC_MODAL_PROCESS_VIDEO_URL` in your frontend `.env`

## Deploy All Functions

```bash
# Deploy all three functions
python3 -m modal deploy modal_app/media_analyzer.py
python3 -m modal deploy modal_app/worker_loop.py
python3 -m modal deploy modal_app/process_video.py
```

## Verify Deployment

Check deployed apps:
```bash
python3 -m modal app list
```

View logs:
```bash
# Media Analyzer logs
python3 -m modal app logs vannilli-media-analyzer

# Worker Loop logs
python3 -m modal app logs vannilli-video-worker

# Process Video logs
python3 -m modal app logs vannilli-process-video
```

## Environment Variables

After deployment, set these in your Supabase Edge Function secrets:

- `MODAL_ANALYZER_URL` - URL from `media_analyzer.py` webhook endpoint
- `NEXT_PUBLIC_MODAL_PROCESS_VIDEO_URL` - URL from `process_video.py` web endpoint

## Troubleshooting

If deployment fails:
1. Check Modal authentication: `modal token show`
2. Verify secrets exist: `modal secret list`
3. Check function syntax: `python3 -m modal deploy modal_app/media_analyzer.py --help`
