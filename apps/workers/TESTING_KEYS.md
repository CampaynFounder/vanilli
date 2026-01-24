# API keys and testing (Kling, Stripe, FFmpeg)

## 1. Kling

- **Used by:** video **queue consumer** (`queue/video-processor.ts`), which calls the Kling API to run the motion-transfer (driver video + target image → lip-sync video).
- **Where to get:** [Kling AI](https://klingai.com) (API keys / developer section).
- **Where to set:**
  - **Secrets** (production / preview):  
    `wrangler secret put KLING_API_KEY`
  - **Local `wrangler dev`:** in `apps/workers/.dev.vars`:
    ```
    KLING_API_KEY=your_key_here
    ```
- **`KLING_API_URL`** is in `wrangler.toml` (e.g. `https://api.klingai.com/v1`). Override in `[vars]` or `.dev.vars` if you use a different base URL.

The **main API** worker (`index.ts`) does **not** use `KLING_API_KEY`; only the **queue consumer** that runs `video-processor.ts` needs it. Ensure the consumer’s `wrangler` config (or the same worker’s queue binding) has `KLING_API_KEY` and `KLING_API_URL` (and optionally `FFMPEG_SERVICE_URL`).

---

## 2. Stripe

- **Used by:** `routes/payment.ts` (checkout, webhooks).
- **Where to get:** [Stripe Dashboard](https://dashboard.stripe.com/apikeys) (Secret key, Webhook signing secret).
- **Where to set:**
  - **Secrets:**
    ```bash
    wrangler secret put STRIPE_SECRET_KEY
    wrangler secret put STRIPE_WEBHOOK_SECRET
    ```
  - **Local:** in `apps/workers/.dev.vars`:
    ```
    STRIPE_SECRET_KEY=sk_test_...
    STRIPE_WEBHOOK_SECRET=whsec_...
    ```

---

## 3. FFmpeg service (optional)

- **Used by:** queue consumer only, when merging Kling video + user audio (and optionally adding a trial watermark).
- **What it is:** An external HTTP service you run; see `FFMPEG_SERVICE.md`.
- **Where to set:**
  - **Secret for the queue consumer:**  
    `wrangler secret put FFMPEG_SERVICE_URL`
  - **Local:** in `.dev.vars`:
    ```
    FFMPEG_SERVICE_URL=https://your-ffmpeg-service.com
    ```
- If **not** set: the worker uses the Kling output as-is (no user-audio swap, no watermark). You can still test the full pipeline; the final video will have the driver’s audio.

---

## 4. Testing: audio vs video duration and generation

### Duration validation (no auth)

- **Endpoint:** `POST /api/validate-media-durations`
- **Body:** `{ "videoDurationSeconds": 30.5, "audioDurationSeconds": 30.2 }`
- **Rules:**  
  - Each between 0.5 and 300 seconds.  
  - Difference ≤ 2 seconds.  
  - Response: `{ "valid": true, "generationSeconds": 30 }` or `{ "valid": false, "error": "..." }` (400).

The **Studio** UI:

1. Reads duration from the video and audio elements (`onLoadedMetadata`).
2. Calls `/api/validate-media-durations` when both are available.
3. Enables **Generate** only when `valid: true` and shows `generationSeconds`.

### Studio flow (auth required)

1. **Upload** (×3):  
   `POST /api/upload/studio-asset`  
   Headers: `Authorization: Bearer <jwt>`, `X-Asset-Type: driverVideo | targetImage | audio`  
   Body: raw file.  
   Response: `{ "key" }`.

2. **Start generation:**  
   `POST /api/start-generation-with-audio`  
   Body:  
   `{ "driverVideoKey", "targetImageKey", "audioKey", "videoDurationSeconds", "audioDurationSeconds", "prompt?", "mode?" }`  
   Uses the same duration rules; returns `internalTaskId`, `projectId`, etc. (202).

3. **Poll:**  
   `GET /api/poll-status/:taskId`  
   Returns `status`: `pending` | `processing` | `completed` | `failed`.

4. **Download (when completed):**  
   `GET /api/download/:generationId`  
   Returns `{ "downloadUrl", "expiresIn", "creditsDeducted", ... }`.

### Local E2E

- Run the **main API** with `wrangler dev` in `apps/workers`; use `NEXT_PUBLIC_API_URL=http://localhost:8787` for the web app.
- The **queue** must be wired to a consumer that runs `video-processor.ts` with `KLING_API_KEY` (and optionally `FFMPEG_SERVICE_URL`). In local `wrangler dev`, that depends on your queue/consumer setup.
- **R2:** `start-generation-with-audio` builds URLs like `https://r2.vannilli.io/{key}`. Kling and the FFmpeg service must be able to reach those. For local tests, you may need R2 and `r2.vannilli.io` (or an equivalent public base) configured.

---

## 5. Quick `.dev.vars` checklist

Copy `apps/workers/.dev.vars.example` to `apps/workers/.dev.vars` and set:

| Variable              | Required for        | Purpose                         |
|-----------------------|---------------------|---------------------------------|
| `SUPABASE_SERVICE_KEY`| API + queue         | Auth and DB                     |
| `KLING_API_KEY`       | Queue consumer      | Kling motion transfer           |
| `STRIPE_SECRET_KEY`   | API                 | Payments                        |
| `STRIPE_WEBHOOK_SECRET` | API              | Webhooks                        |
| `ADMIN_PASSWORD`      | API                 | Admin routes                    |
| `FFMPEG_SERVICE_URL`  | Queue consumer      | Optional: merge + watermark     |

Then run `wrangler dev` from `apps/workers` and use the Studio to test duration validation, uploads, and (with the queue consumer and Kling/FFmpeg set up) the full generation.
