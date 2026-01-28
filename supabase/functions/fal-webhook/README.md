# fal-webhook

Supabase Edge Function for fal.ai webhook callbacks.

## Overview

This function receives webhook callbacks from fal.ai when video generation requests complete. It updates the corresponding `video_chunks` record in the database with the result, allowing the worker loop to continue processing (muxing audio, etc.) without polling.

## Secrets

No additional secrets required beyond standard Supabase environment variables:
- `SUPABASE_URL` (auto-injected)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-injected)

## Deploy

```bash
supabase functions deploy fal-webhook
```

## Webhook URL

After deployment, your webhook URL will be:
```
https://<project-ref>.supabase.co/functions/v1/fal-webhook
```

## Usage

The webhook is automatically used when submitting fal.ai requests with a `webhookUrl` parameter:

```python
# In video_orchestrator.py or worker_loop.py
webhook_url = f"{supabase_url}/functions/v1/fal-webhook"
request_id = kling_client.generate(
    driver_video_url=video_url,
    target_image_url=image_url,
    prompt=prompt,
    webhook_url=webhook_url  # fal.ai will call this when done
)
```

## Webhook Payload Format

fal.ai sends POST requests with JSON payloads like:

### Completed Request
```json
{
  "request_id": "764cabcf-b745-4b3e-ae38-1200304cf45b",
  "status": "COMPLETED",
  "response": {
    "video": {
      "url": "https://v3b.fal.media/files/.../output.mp4"
    }
  }
}
```

### Failed Request
```json
{
  "request_id": "764cabcf-b745-4b3e-ae38-1200304cf45b",
  "status": "FAILED",
  "error": {
    "message": "Error description"
  }
}
```

## Database Updates

The webhook updates the `video_chunks` table:

- **On COMPLETED**: Sets `status = 'COMPLETED'`, `kling_video_url`, and `kling_completed_at`
- **On FAILED**: Sets `status = 'FAILED'`, `error_message`, and `kling_completed_at`

The worker loop then polls for chunks with `status = 'COMPLETED'` and `kling_video_url IS NOT NULL` to continue processing (muxing audio, uploading final video, etc.).

## Error Handling

- Returns `200 OK` even if chunk not found (to prevent fal.ai retries)
- Logs errors to console for debugging
- Updates chunk status appropriately on failures
