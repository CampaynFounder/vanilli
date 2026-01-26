# Media Analyzer Webhook API Documentation

## Endpoint URL

After deploying `media_analyzer.py`, you'll get a URL like:
```
https://YOUR_USERNAME--vannilli-media-analyzer-api.modal.run
```

Set this as `MODAL_ANALYZER_URL` in your Supabase Edge Function secrets.

---

## Request Format

### HTTP Method
**POST** (required)

### HTTP Headers

#### Required Headers:
```
Content-Type: application/json
```

#### Optional Headers (if authentication enabled):
```
Authorization: Bearer YOUR_MODAL_WEBHOOK_SECRET
```
*Only required if `MODAL_WEBHOOK_SECRET` is set in Modal secrets*

---

## HTTP Body Parameters (JSON)

### Required Parameters:
All parameters go in the **HTTP request body as JSON** (not URL parameters, not headers).

```json
{
  "job_id": "uuid-string",
  "video": "https://signed-url-to-video.mp4",
  "audio": "https://signed-url-to-audio.wav"
}
```

#### Parameter Details:

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `job_id` | string (UUID) | ✅ **YES** | The `video_jobs.id` from your database | `"550e8400-e29b-41d4-a716-446655440000"` |
| `video` | string (URL) | ✅ **YES** | Signed URL to the user's tracking video file (must be HTTPS) | `"https://supabase.co/storage/v1/object/sign/vannilli/inputs/.../tracking.mp4?token=..."` |
| `audio` | string (URL) | ✅ **YES** | Signed URL to the master audio file (must be HTTPS) | `"https://supabase.co/storage/v1/object/sign/vannilli/inputs/.../audio.wav?token=..."` |

---

## Complete Example Request

### Using cURL:
```bash
curl -X POST https://YOUR_USERNAME--vannilli-media-analyzer-api.modal.run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SECRET" \
  -d '{
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "video": "https://supabase.co/storage/v1/object/sign/vannilli/inputs/abc123/tracking.mp4?token=xyz",
    "audio": "https://supabase.co/storage/v1/object/sign/vannilli/inputs/abc123/audio.wav?token=xyz"
  }'
```

### Using JavaScript/TypeScript (Supabase Edge Function):
```typescript
const response = await fetch(modalAnalyzerUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    // Optional: "Authorization": `Bearer ${webhookSecret}`,
  },
  body: JSON.stringify({
    job_id: jobId,
    video: record.user_video_url,
    audio: record.master_audio_url,
  }),
});
```

### Using Python:
```python
import requests

response = requests.post(
    "https://YOUR_USERNAME--vannilli-media-analyzer-api.modal.run",
    headers={
        "Content-Type": "application/json",
        # Optional: "Authorization": f"Bearer {webhook_secret}",
    },
    json={
        "job_id": "550e8400-e29b-41d4-a716-446655440000",
        "video": "https://supabase.co/storage/v1/object/sign/vannilli/inputs/abc123/tracking.mp4?token=xyz",
        "audio": "https://supabase.co/storage/v1/object/sign/vannilli/inputs/abc123/audio.wav?token=xyz",
    },
)
```

---

## Response Format

### Success Response (200 OK):
```json
{
  "status": "Analysis Complete",
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "sync_offset": 0.5,
  "bpm": 120.0,
  "chunk_duration": 8.65
}
```

### Error Responses:

#### 400 Bad Request (Missing/Invalid Parameters):
```json
{
  "error": "Missing required fields: job_id, video, audio"
}
```

#### 400 Bad Request (Invalid URL):
```json
{
  "error": "Invalid video URL format"
}
```

#### 401 Unauthorized (Invalid API Key):
```json
{
  "error": "Unauthorized - invalid API key"
}
```

#### 500 Internal Server Error:
```json
{
  "error": "Error message here",
  "job_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## Current Implementation in dispatch-job Edge Function

Your `supabase/functions/dispatch-job/index.ts` already implements this correctly:

```typescript
const analyzerResponse = await fetch(modalAnalyzerUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    job_id: jobId,
    video: record.user_video_url,
    audio: record.master_audio_url,
  }),
});
```

**This is correct!** ✅

---

## Summary

- **HTTP Method:** POST
- **Headers:** `Content-Type: application/json` (required), `Authorization: Bearer <secret>` (optional)
- **Body:** JSON with `job_id`, `video`, `audio` (all required)
- **No URL parameters** - everything goes in the JSON body
- **No query string parameters** - everything goes in the JSON body
