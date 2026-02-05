# recheck-generation

Edge Function that lets customers request a **completion recheck** for a generation (e.g. when the Fal webhook missed or the worker timed out).

## Behaviour

- **Eligibility:** Generation must be `processing` or `pending`, have `cost_credits > 0`, be at least **10 minutes** old, and have **fewer than 3** refresh requests.
- **Rate limit:** Max **3** refresh requests per generation (stored in `generations.refresh_requests_count`).
- **Actions:** Increments `refresh_requests_count`, then for each `video_chunk` with `status = PROCESSING` and a `fal_request_id`, calls the Fal queue API. Updates chunks to `COMPLETED` or `FAILED` as appropriate. If all chunks for the job are completed, marks the job and generation as completed (using the first chunk’s video URL when no stitched final exists).

## Secrets

- `FAL_API_KEY` – required; used to call Fal queue status/result APIs.

## Deploy

```bash
supabase functions deploy recheck-generation
```

Set the secret:

```bash
supabase secrets set FAL_API_KEY=your_fal_api_key
```

## Request

- **Method:** POST  
- **Headers:** `Authorization: Bearer <user_jwt>`  
- **Body:** `{ "generation_id": "<uuid>" }`  

Response: `{ "success": true }` or `{ "error": "..." }` with an appropriate status code.
