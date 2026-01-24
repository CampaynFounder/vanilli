# FFmpeg merge service (optional)

The video **queue consumer** (`queue/video-processor.ts`) can call an external HTTP service to:

1. Download the Kling output video and the user’s audio track
2. Replace the video’s audio with the user’s track (`ffmpeg -map 0:v -map 1:a -c:v copy -c:a aac`)
3. Optionally add a VANNILLI watermark when `addWatermark: true` (trial users)

If `FFMPEG_SERVICE_URL` is **not** set, the worker uses the Kling output as-is (no user audio swap, no watermark).

---

## Contract

**Endpoint:** `POST {FFMPEG_SERVICE_URL}/merge`  
**Request (JSON):**

```json
{
  "klingVideoUrl": "https://...",
  "audioTrackUrl": "https://...",
  "addWatermark": true
}
```

**Response:** HTTP 200 with **binary body** = final MP4 (video from `klingVideoUrl`, audio from `audioTrackUrl`, optional watermark overlay).

**Errors:** 4xx/5xx with a text or JSON body; the worker will fail the generation and store `FFmpeg merge failed: {status} {body}`.

---

## Deployment options

- **Node + ffmpeg (Docker):** Run Express/Fastify, spawn `ffmpeg` for the merge and optional watermark, stream the result.
- **Cloud Run / Fly.io / Railway:** Same idea; ensure the service can reach `klingVideoUrl` and `audioTrackUrl` (they are public R2 URLs when `r2.vannilli.io` is configured).
- **Separate Cloudflare Worker + FFmpeg.wasm:** Possible but more involved; the worker would need to fetch both media, run FFmpeg.wasm in the worker, and return the resulting buffer.

---

## Setting the URL

- **Local / preview:** In `.dev.vars` (from `.dev.vars.example`):

  ```bash
  FFMPEG_SERVICE_URL=https://your-ffmpeg-service.com
  ```

- **Production:** As a secret for the **queue consumer** worker:

  ```bash
  wrangler secret put FFMPEG_SERVICE_URL
  ```

The **main API** worker does not need `FFMPEG_SERVICE_URL`; only the queue consumer that runs `video-processor.ts` uses it.
