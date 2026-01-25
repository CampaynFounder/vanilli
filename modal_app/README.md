# Modal: process_video

This app runs on [Modal](https://modal.com). It accepts a POST with signed URLs for tracking video, target image, and audio; runs them through Kling + FFmpeg; then uploads the result to Supabase and updates `generations`.

## Prerequisites

- [Modal CLI](https://modal.com/docs/guide/install) and `modal setup` (or `modal token`)
- Modal secret `vannilli-secrets` with: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; and either:
  - **Kling (Access Key + Secret Key):** `KLING_ACCESS_KEY` and `KLING_SECRET_KEY` — a JWT is built and used as `Authorization: Bearer`
  - **Kling (single key):** `KLING_API_KEY` — used directly as Bearer (if you have only one token).  
  Optionally: `KLING_API_URL` (default `https://api.klingai.com/v1`).

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
./modal_app/deploy.sh
# or: npm run modal:deploy
# or: modal deploy modal_app/process_video.py
```

`modal deploy` prints **two** URLs: `process-video` (main) and `test-kling-auth`. Use the **process-video** URL in `NEXT_PUBLIC_MODAL_PROCESS_VIDEO_URL`. Optionally set `NEXT_PUBLIC_MODAL_TEST_VIDEO_API_URL` to the **test-kling-auth** URL to enable the "Verify video API" button on `/debug`.

## Generate JWT from Modal secrets (for Kling verification)

The `test_kling_auth` endpoint uses the **keys in vannilli-secrets** (no plaintext on your machine) to build a JWT and return it. You can paste that JWT into Kling’s verification tool to confirm the stored keys work.

1. Deploy Modal. Copy the **test-kling-auth** URL from the deploy output.
2. Set `NEXT_PUBLIC_MODAL_TEST_VIDEO_API_URL` to that URL.
3. Open **/debug** and click **Generate JWT**. The JWT appears in a copyable box; click **Copy** and paste it into Kling’s verifier.

The endpoint also POSTs to the video API with dummy URLs; the status below the JWT (Auth OK vs 401) reflects that. The JWT is returned even when the dummy POST gets 401, so you can still verify the token in Kling.

## Logging and 403 RLS debugging

When `generation_seconds` > 0, the function trims the tracking video, uploads it to `inputs/{id}/tracking_trimmed.mp4`, and uses that for Kling. In Modal logs you’ll see:

- `[vannilli] SUPABASE_SERVICE_ROLE_KEY present: True, len=N` – confirms the service role key is set (not the anon key).
- `[vannilli] trim/upload: gen_secs=… path=…` – before upload.
- `[vannilli] trim/upload OK: …` – upload and signed URL succeeded.
- `[vannilli] trim/upload FAIL: type=… … body=…` – on error; includes exception type, message, and response status/body for 403 “new row violates row-level security policy” and similar.

Storage RLS for `service_role` on `vannilli/inputs/` and `vannilli/outputs/` must be in place. Run `packages/database/add-inputs-storage-service-role.sql` in the Supabase SQL Editor, then the verification query at the bottom to confirm all 8 policies exist.
