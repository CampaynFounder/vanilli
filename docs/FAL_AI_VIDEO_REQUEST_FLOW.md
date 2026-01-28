# fal.ai Video Request Flow

This document explains when and how we request the final video from fal.ai.

## Overview

We use a **dual-path approach** to get the video URL from fal.ai:
1. **Webhook** (async, faster) - fal.ai calls our webhook when video is ready
2. **Polling** (sync, fallback) - We poll fal.ai's queue API if webhook hasn't arrived yet

## Timeline

### 1. Submit Request to fal.ai

**Location**: `worker_loop.py` → `kling_client.generate()`

```python
# Submit chunk to fal.ai
webhook_url = f"{supabase_url}/functions/v1/fal-webhook"
task_id = kling_client.generate(chunk_url, current_image, prompt, webhook_url=webhook_url)
```

**What happens**:
- POST request to `https://queue.fal.run/fal-ai/kling-video/v2.6/standard/motion-control`
- fal.ai returns `request_id` immediately
- We store `request_id` as `fal_request_id` in database **immediately**
- fal.ai will process the video asynchronously

**fal.ai Response**:
```json
{
  "request_id": "b416c136-90dd-4689-b70d-efe7c836dbce",
  "response_url": "https://queue.fal.run/kling-video/v2.6/requests/...",
  "status_url": "https://queue.fal.run/kling-video/v2.6/requests/.../status"
}
```

### 2. Wait for Video (Two Paths)

#### Path A: Webhook (Preferred)

**When**: fal.ai calls our webhook when video is ready (usually 30-90 seconds)

**Location**: `supabase/functions/fal-webhook/index.ts`

**What happens**:
1. fal.ai sends POST to our webhook with:
   ```json
   {
     "request_id": "b416c136-90dd-4689-b70d-efe7c836dbce",
     "status": "OK" or "COMPLETED",
     "response": {
       "video": {
         "url": "https://v3b.fal.media/files/.../output.mp4"
       }
     }
   }
   ```
2. Webhook finds chunk by `fal_request_id = request_id`
3. Webhook extracts video URL from payload
4. Webhook updates database:
   - `status = 'COMPLETED'`
   - `kling_video_url = <extracted_url>`
   - `kling_completed_at = <timestamp>`

#### Path B: Polling (Fallback)

**When**: Worker loop checks if webhook already provided URL, if not, polls fal.ai

**Location**: `worker_loop.py` → `kling_client.poll_status()`

**What happens**:
1. **First**: Check database for existing `kling_video_url`
   ```python
   chunk_check = supabase.table("video_chunks").select("kling_video_url, status")
       .eq("id", chunk_id).single().execute()
   if chunk_check.data.get("kling_video_url") and status == "COMPLETED":
       # Use webhook-provided URL, skip polling
   ```

2. **If not found**: Poll fal.ai status endpoint
   ```python
   # Poll status every 5 seconds
   GET https://queue.fal.run/kling-video/v2.6/requests/{request_id}/status
   ```

3. **When status = "COMPLETED"**: Fetch result endpoint
   ```python
   GET https://queue.fal.run/kling-video/v2.6/requests/{request_id}
   ```

4. **Extract video URL** from response:
   ```json
   {
     "response": {
       "video": {
         "url": "https://v3b.fal.media/files/.../output.mp4"
       }
     }
   }
   ```

5. **Update database** (in case webhook missed it):
   - `status = 'COMPLETED'`
   - `kling_video_url = <extracted_url>`
   - `kling_completed_at = <timestamp>`

### 3. Download Video

**Location**: `worker_loop.py` (after getting video URL)

**What happens**:
```python
# Download video from fal.ai URL
r = requests.get(kling_video_url, timeout=120)
kling_output_path.write_bytes(r.content)
```

**When**: Immediately after getting `kling_video_url` (from webhook or polling)

### 4. Process Video

**Location**: `worker_loop.py`

**What happens**:
1. Extract audio slice from master audio
2. Mux video + audio together
3. Upload final chunk to Supabase storage
4. Continue to next chunk

## Key Points

1. **We request the video URL, not the video itself**:
   - fal.ai generates the video and stores it on their CDN
   - They give us a URL to download it
   - We download it using `requests.get(kling_video_url)`

2. **Webhook is faster**:
   - fal.ai calls us when ready (no polling delay)
   - We check database first before polling
   - Polling is only used if webhook hasn't arrived

3. **Two API calls to fal.ai**:
   - **Submission**: `POST /fal-ai/kling-video/v2.6/standard/motion-control` → get `request_id`
   - **Result**: `GET /kling-video/v2.6/requests/{request_id}` → get video URL (only if webhook didn't provide it)

4. **Video download is separate**:
   - After getting URL, we download from fal.ai's CDN
   - This is a direct HTTP GET to the video URL (not an API call)

## Flow Diagram

```
1. Submit Request
   worker_loop → kling_client.generate()
   ↓
   POST to fal.ai → get request_id
   ↓
   Store fal_request_id in DB

2. Wait for Video (Parallel Paths)
   
   Path A: Webhook (async)
   fal.ai → webhook function
   ↓
   Extract video URL from payload
   ↓
   Update DB: kling_video_url, status=COMPLETED
   
   Path B: Polling (sync, fallback)
   worker_loop checks DB for kling_video_url
   ↓
   If not found: poll fal.ai status
   ↓
   When COMPLETED: fetch result endpoint
   ↓
   Extract video URL
   ↓
   Update DB: kling_video_url, status=COMPLETED

3. Download Video
   worker_loop → requests.get(kling_video_url)
   ↓
   Save to local file

4. Process Video
   Extract audio slice
   Mux video + audio
   Upload to Supabase
```

## API Endpoints Used

1. **Submit**: `POST https://queue.fal.run/fal-ai/kling-video/v2.6/standard/motion-control`
2. **Status**: `GET https://queue.fal.run/kling-video/v2.6/requests/{request_id}/status`
3. **Result**: `GET https://queue.fal.run/kling-video/v2.6/requests/{request_id}`
4. **Download**: `GET https://v3b.fal.media/files/.../output.mp4` (direct CDN URL)
