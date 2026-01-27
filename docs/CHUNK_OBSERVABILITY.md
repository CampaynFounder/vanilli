# Chunk Observability Guide

This document explains how to use the chunk observability system to validate which chunks are being sent to Kling and ensure proper synchronization.

## Overview

The observability system tracks detailed information about each video chunk processed:
- **Image pairing**: Which image (by index and URL) is sent with each video chunk
- **Video timing**: Start time and duration of each video chunk
- **Audio timing**: Start time of audio extraction (with sync offset)
- **Kling API**: Task IDs, request/completion timestamps, and output URLs
- **Synchronization**: Validation that video chunk 1 pairs with audio chunk 1 and image 1

## Database Schema

### `video_chunks` Table Columns

The following observability columns have been added:

| Column | Type | Description |
|--------|------|-------------|
| `image_url` | TEXT | URL of the image sent to Kling with this chunk |
| `image_index` | INTEGER | 0-based index of which image from target_images array |
| `video_chunk_url` | TEXT | Signed URL of the video chunk sent to Kling |
| `video_chunk_start_time` | FLOAT | Start time of chunk in original video (seconds) |
| `audio_start_time` | FLOAT | Calculated audio start time (includes sync_offset) |
| `sync_offset` | FLOAT | Sync offset applied for audio alignment |
| `chunk_duration` | FLOAT | Duration of this chunk (seconds) |
| `kling_task_id` | TEXT | Kling API task ID from motion-control endpoint |
| `kling_requested_at` | TIMESTAMPTZ | When Kling API was called |
| `kling_completed_at` | TIMESTAMPTZ | When Kling finished processing |
| `kling_video_url` | TEXT | URL of Kling output video |

## Querying Observability Data

### View All Chunk Details for a Generation

```sql
SELECT 
    chunk_index,
    image_index,
    image_url,
    video_chunk_start_time,
    audio_start_time,
    sync_offset,
    kling_task_id,
    kling_requested_at,
    kling_completed_at,
    status
FROM chunk_observability
WHERE generation_id = 'your-generation-id'
ORDER BY chunk_index;
```

### Validate Chunk Synchronization

Check that video chunk 1 pairs with audio chunk 1 and image 1:

```sql
SELECT 
    chunk_index,
    image_index,
    video_chunk_start_time,
    audio_start_time,
    sync_offset,
    audio_start_time - video_chunk_start_time AS calculated_offset,
    image_index_matches_rotation,
    audio_video_sync_valid
FROM chunk_observability
WHERE generation_id = 'your-generation-id'
ORDER BY chunk_index;
```

### Get Synchronization Summary

```sql
SELECT *
FROM chunk_sync_summary
WHERE generation_id = 'your-generation-id';
```

This shows:
- Total chunks and completion status
- Image rotation validation
- Timing ranges
- Sync offset consistency
- Kling processing statistics
- Validation flags

### Find Chunks with Sync Issues

```sql
SELECT 
    chunk_index,
    image_index,
    video_chunk_start_time,
    audio_start_time,
    sync_offset,
    audio_video_sync_valid,
    image_index_matches_rotation
FROM chunk_observability
WHERE generation_id = 'your-generation-id'
  AND (audio_video_sync_valid = false OR image_index_matches_rotation = false)
ORDER BY chunk_index;
```

### Track Kling Processing Times

```sql
SELECT 
    chunk_index,
    kling_task_id,
    kling_requested_at,
    kling_completed_at,
    kling_processing_seconds,
    status
FROM chunk_observability
WHERE generation_id = 'your-generation-id'
ORDER BY chunk_index;
```

## Validation Rules

### Image Rotation
- Chunk 0 should use image at index `0 % len(images)`
- Chunk 1 should use image at index `1 % len(images)`
- Chunk 2 should use image at index `2 % len(images)`
- And so on...

The `image_index_matches_rotation` flag validates this automatically.

### Audio-Video Synchronization
- Audio start time should equal: `video_chunk_start_time + sync_offset`
- The `audio_video_sync_valid` flag validates this automatically.

### Chunk Ordering
- Video chunks should be sequential (0, 1, 2, ...)
- Each chunk should have a start time that is `chunk_index * chunk_duration`
- Audio start times should be sequential with sync offset applied

## Example: Validate a Complete Generation

```sql
-- Get full observability report
SELECT 
    co.chunk_index,
    co.image_index,
    co.image_url,
    co.video_chunk_start_time,
    co.audio_start_time,
    co.sync_offset,
    co.kling_task_id,
    co.kling_processing_seconds,
    co.status,
    co.audio_video_sync_valid,
    co.image_index_matches_rotation
FROM chunk_observability co
WHERE co.generation_id = 'your-generation-id'
ORDER BY co.chunk_index;

-- Get summary
SELECT * FROM chunk_sync_summary WHERE generation_id = 'your-generation-id';
```

## Backend Logging

The worker also logs detailed information to stdout:

```
[worker] Chunk 1/5 observability:
  - Video chunk start: 0.000s
  - Audio start: 0.150s (sync_offset: 0.150s)
  - Image index: 0/2, URL: https://...
  - Video chunk URL: https://...
  - Chunk duration: 8.500s
[worker] Chunk 1/5 Kling completed:
  - Task ID: task_abc123
  - Kling video URL: https://...
  - Requested at: 2026-01-27T10:00:00Z
  - Completed at: 2026-01-27T10:01:15Z
```

## Troubleshooting

### Issue: Image index doesn't match expected rotation
- Check the `image_index` column vs expected `chunk_index % len(images)`
- Verify the `target_images` array in the job

### Issue: Audio start time doesn't match video + sync_offset
- Check `audio_start_time` vs `video_chunk_start_time + sync_offset`
- Verify the `sync_offset` value is correct
- Check if audio extraction is using the correct start time

### Issue: Kling task ID missing
- Check if Kling API call succeeded
- Verify `kling_requested_at` timestamp exists
- Check error_message for API failures

## Migration

To apply the observability system:

1. Run the database migration:
   ```sql
   -- Run: packages/database/add-chunk-observability.sql
   -- Run: packages/database/add-chunk-observability-views.sql
   ```

2. Deploy the updated worker code (already includes observability logging)

3. Query the views to validate chunk processing

## Notes

- Observability data is captured for both successful and failed chunks
- Failed chunks may have partial observability data (depending on when the error occurred)
- All timestamps are in UTC
- Time values are in seconds (float precision)
