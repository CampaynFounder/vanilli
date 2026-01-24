# API Keys and Secrets

How to provide and configure Kling, Stripe, and the optional FFmpeg service for the Vannilli Workers API.

---

## 1. Kling AI

Used for lip-sync / motion transfer (tracking video + target image → video).

### Get keys

- Sign up: [Kling AI](https://app.klingai.com/)
- Create an API key in the developer dashboard.
- Base URL is usually: `https://api.klingai.com/v1` (default in `wrangler.toml`).

### Set in Workers

**Secrets (sensitive):**

```bash
cd apps/workers
npx wrangler secret put KLING_API_KEY
# Paste your Kling API key when prompted
```

**Variables (non-sensitive, already in wrangler.toml):**

- `KLING_API_URL` – e.g. `https://api.klingai.com/v1` (set in `[env.production.vars]` / `[env.preview.vars]`).

### What uses them

- `@vannilli/kling-adapter` in the **video queue consumer** (`queue/video-processor.ts`).
- Env: `KLING_API_KEY`, `KLING_API_URL`.

---

## 2. Stripe

Used for checkout and webhooks (subscriptions, one-time credit top-ups).

### Get keys

- [Stripe Dashboard](https://dashboard.stripe.com/) → Developers → API keys.
- **Secret key:** `sk_test_...` or `sk_live_...`.
- **Webhook signing secret:**  
  - Developers → Webhooks → Add endpoint:  
    `https://api.vannilli.xaino.io/api/webhooks/stripe`  
  - Copy the **Signing secret** (`whsec_...`).

### Set in Workers

```bash
cd apps/workers
npx wrangler secret put STRIPE_SECRET_KEY
# Paste sk_test_... or sk_live_...

npx wrangler secret put STRIPE_WEBHOOK_SECRET
# Paste whsec_...
```

### What uses them

- `routes/payment.ts`: Checkout (`/api/checkout`), webhooks (`/api/webhooks/stripe`).
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

### Local / preview

For `wrangler dev` or preview:

```bash
npx wrangler secret put STRIPE_SECRET_KEY --env preview
npx wrangler secret put STRIPE_WEBHOOK_SECRET --env preview
```

Use Stripe CLI to forward webhooks to `http://localhost:8787/api/webhooks/stripe` when testing locally.

---

## 3. FFmpeg service (optional)

The Worker **cannot run FFmpeg** (no binary in the runtime). The pipeline expects an **external HTTP service** that:

1. Accepts: Kling video URL + user audio URL.
2. Runs:  
   `ffmpeg -i kling_video -i audio_track -map 0:v -map 1:a -c:v copy -c:a aac [-watermark if trial] output.mp4`
3. Returns: final MP4 (e.g. redirect to file or `200` with `video/mp4` body).

### Contract

- **Endpoint:** `POST {FFMPEG_SERVICE_URL}/merge`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "klingVideoUrl": "https://...",
    "audioTrackUrl": "https://...",
    "addWatermark": false
  }
  ```
- **Success:** `200` with `Content-Type: video/mp4` and body = MP4 bytes (or `302` to a temporary URL the Worker can fetch).
- **Error:** `4xx`/`5xx` with JSON `{ "error": "..." }`.

### Set in Workers

If you run an FFmpeg service:

```bash
npx wrangler secret put FFMPEG_SERVICE_URL
# e.g. https://ffmpeg.yourservice.com
```

If `FFMPEG_SERVICE_URL` is **not** set:

- The Worker uses **Kling’s output as the final video** (no user audio, no watermark).
- The queue still accepts and stores `audioTrackUrl` for when you add the service.

### Example: minimal FFmpeg service

A small server (Node, Python, etc.) that:

1. Receives `klingVideoUrl`, `audioTrackUrl`, `addWatermark`.
2. Downloads both to disk/temp.
3. Runs:
   - `ffmpeg -i kling.mp4 -i audio.mp3 -map 0:v -map 1:a -c:v copy -c:a aac out.mp4`  
   - If `addWatermark`: add `-vf "drawtext=text='VANNILLI.io'..."` (or equivalent).
4. Streams `out.mp4` as the response (or uploads to R2 and returns a URL, depending on your design).

---

## 4. Other required secrets

These are already used by the codebase; set them as well:

```bash
npx wrangler secret put SUPABASE_SERVICE_KEY   # Supabase service_role key
npx wrangler secret put ADMIN_PASSWORD         # For /api/admin/* protect
```

---

## 5. Checklist

| Secret / Var      | Required | Purpose                          |
|-------------------|----------|----------------------------------|
| `KLING_API_KEY`   | Yes      | Kling motion-control API         |
| `KLING_API_URL`   | No*      | Kling base URL (has default)     |
| `STRIPE_SECRET_KEY` | Yes    | Stripe API                       |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook verification |
| `FFMPEG_SERVICE_URL` | No   | Audio merge + optional watermark |
| `SUPABASE_SERVICE_KEY` | Yes | DB and Auth in Workers      |
| `ADMIN_PASSWORD`  | Yes      | Admin API protection             |

\* `KLING_API_URL` has a default in `wrangler.toml`; override only if you use another host.

---

## 6. Testing

**Kling**

- Start a generation via `/api/start-generation` (or the new start-generation flow with audio + durations).
- Check queue consumer logs for Kling calls and errors.

**Stripe**

- Use `sk_test_...` and `whsec_...` from a test-mode webhook.
- Run `stripe listen --forward-to localhost:8787/api/webhooks/stripe` when using `wrangler dev`.

**Duration validation**

- Call `POST /api/validate-media-durations` with `videoDurationSeconds` and `audioDurationSeconds` to test the comparison logic before starting a generation.

---

## 7. Testing duration and generation flow

### Validate audio vs video duration

```bash
# OK: within 2s of each other
curl -s -X POST http://localhost:8787/api/validate-media-durations \
  -H "Content-Type: application/json" \
  -d '{"videoDurationSeconds": 30, "audioDurationSeconds": 30.5}'
# -> {"valid":true,"generationSeconds":30}

# Rejected: >2s difference
curl -s -X POST http://localhost:8787/api/validate-media-durations \
  -H "Content-Type: application/json" \
  -d '{"videoDurationSeconds": 30, "audioDurationSeconds": 45}'
# -> 400 {"valid":false,"error":"Audio (45.0s) and video (30.0s) must be within 2s of each other for lip-sync"}
```

### Upload studio assets (auth required)

```bash
# 1. Get a JWT (sign in via your app or Supabase)
export JWT="your_jwt_here"

# 2. Upload tracking video
curl -s -X POST http://localhost:8787/api/upload/studio-asset \
  -H "Authorization: Bearer $JWT" \
  -H "X-Asset-Type: driverVideo" \
  --data-binary @tracking.mp4
# -> {"key":"driver-videos/USER_ID/UUID.mp4"}

# 3. Upload target image
curl -X POST http://localhost:8787/api/upload/studio-asset \
  -H "Authorization: Bearer $JWT" \
  -H "X-Asset-Type: targetImage" \
  --data-binary @face.jpg
# -> {"key":"target-images/USER_ID/UUID.jpg"}

# 4. Upload audio
curl -X POST http://localhost:8787/api/upload/studio-asset \
  -H "Authorization: Bearer $JWT" \
  -H "X-Asset-Type: audio" \
  --data-binary @track.mp3
# -> {"key":"audio/USER_ID/UUID.mp3"}
```

### Start generation with audio

```bash
curl -s -X POST http://localhost:8787/api/start-generation-with-audio \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "driverVideoKey": "driver-videos/USER_ID/UUID.mp4",
    "targetImageKey": "target-images/USER_ID/UUID.jpg",
    "audioKey": "audio/USER_ID/UUID.mp3",
    "videoDurationSeconds": 30,
    "audioDurationSeconds": 30.2
  }'
# -> 202 { "internalTaskId", "projectId", "status": "pending", "generationSeconds": 30, ... }
```

**Note:** R2 objects must be reachable at `https://r2.vannilli.io/{key}` (or your R2 public URL) for Kling and the FFmpeg service. If R2 is not public, you need signed GET URLs or a proxy.
