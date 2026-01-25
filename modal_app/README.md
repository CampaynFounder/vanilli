# Modal: process_video

This app runs on [Modal](https://modal.com). It accepts a POST with signed URLs for tracking video, target image, and audio; runs them through Kling + FFmpeg; then uploads the result to Supabase and updates `generations`.

## Prerequisites

- [Modal CLI](https://modal.com/docs/guide/install) and `modal setup` (or `modal token`)
- Modal secret `vannilli-secrets` with: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KLING_API_KEY`, and optionally `KLING_API_URL`

## Run and test before using from the app

### 1. Serve the web endpoint (ephemeral dev URL)

From the **repo root**:

```bash
modal serve modal_app/process_video.py
```

Leave this running. It will:

- Build the image and deploy the function to Modal
- Print a URL like `https://<workspace>--vannilli-process-video-process-video-dev.modal.run`
- Hot-reload when you change `process_video.py`

### 2. Smoke test (no real assets)

Checks that the endpoint is up and returns the expected error for missing fields.

**Using the script:**

```bash
# After modal serve prints the URL:
./modal_app/smoke_test.sh "https://YOUR-WORKSPACE--vannilli-process-video-process-video-dev.modal.run"

# Or set the URL and run without args:
export MODAL_URL="https://...--...-dev.modal.run"
./modal_app/smoke_test.sh
```

**Or with curl directly:**

```bash
export MODAL_URL="https://YOUR-WORKSPACE--vannilli-process-video-process-video-dev.modal.run"

curl -s -X POST "$MODAL_URL" \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: {"ok":false,"error":"Missing required fields"}
```

### 3. Full test (real Kling + Supabase)

The function needs:

- `tracking_video_url`, `target_image_url`, `audio_track_url` – publicly reachable URLs (e.g. Supabase signed URLs)
- `generation_id` – an existing `generations` row with `status: 'pending'`
- Optional: `is_trial` (default `false`), `generation_seconds` (when > 0: trim tracking and audio to this many seconds before Kling and merge), `prompt` (string, max 100 chars; passed to Kling motion-control for context/environment)

**Option A – Use the app once, then call Modal yourself**

1. In the app: create a project + generation and upload the 3 files (or run `handleGenerate` until it has created the generation and signed URLs).
2. In DevTools → Network: find the `fetch` to the Modal URL and copy the **Request Payload** (or the `generation_id` and the three `*_url` values).
3. Point that request at your `modal serve` URL and send it (e.g. with `curl` or Postman), or temporarily set `NEXT_PUBLIC_MODAL_PROCESS_VIDEO_URL` to the `modal serve` URL and run the app; the app’s `fetch` will hit your dev endpoint.

**Option B – Manual generation row + storage uploads**

1. In Supabase: insert a `project`, then a `generation` with `project_id` and `status: 'pending'`.
2. Upload `tracking.mp4`, `target.jpg`, `audio.mp3` to `vannilli/inputs/<generation_id>/` and create 1h signed URLs for each.
3. POST to your `modal serve` URL:

```bash
curl -s -X POST "$MODAL_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "tracking_video_url": "https://...",
    "target_image_url": "https://...",
    "audio_track_url": "https://...",
    "generation_id": "the-uuid",
    "is_trial": false,
    "prompt": "On a stage with soft lighting"
  }'
```

### 4. Use the app against the dev Modal endpoint

1. Run `modal serve modal_app/process_video.py` and copy the printed URL.
2. Set in `.env.local` (or your env):

   ```bash
   NEXT_PUBLIC_MODAL_PROCESS_VIDEO_URL=https://YOUR-WORKSPACE--vannilli-process-video-process-video-dev.modal.run
   ```

3. Start the Next.js app and run a Studio generation. The app will call your `modal serve` endpoint instead of the deployed one.

## Deploy (production)

```bash
modal deploy modal_app/process_video.py
```

Use the **deployed** URL (no `-dev`) in `NEXT_PUBLIC_MODAL_PROCESS_VIDEO_URL` for production.
