# Video Plays Table Setup & Maintenance

## Initial Setup

Run `add-video-plays-table.sql` in Supabase SQL Editor to create the table and initialize play counts.

## Adding New Videos

**IMPORTANT:** When adding a new video to the homepage gallery, you must also:

1. **Update the SQL initialization** in `add-video-plays-table.sql`:
   ```sql
   INSERT INTO video_plays (video_id, video_url, display_count, actual_play_count)
   VALUES
     ('video2', '/videos/video2.MOV', 12347, 0),
     ('video3', '/videos/video3.MOV', 12348, 0),
     -- ... existing videos ...
     ('video7', '/videos/video7.MOV', 12352, 0)  -- NEW VIDEO
   ON CONFLICT (video_id) DO NOTHING;
   ```

2. **Update the frontend** in `apps/web/src/components/VideoGallery.tsx`:
   - Add the new video to the `placeholderVideos` array
   - The play counter will automatically work once the database record exists

3. **Run the SQL** in Supabase to add the new video record

## Play Count Pattern

- Each video starts with a unique number starting from 12347
- Video 2: 12347
- Video 3: 12348
- Video 4: 12349
- Video 5: 12350
- Video 6: 12351
- Video 7: 12352 (next)
- Pattern: `12347 + (video_number - 2)`

## Manual SQL for New Videos

If you need to add a video manually without running the full script:

```sql
INSERT INTO video_plays (video_id, video_url, display_count, actual_play_count)
VALUES
  ('video7', '/videos/video7.MOV', 12352, 0)
ON CONFLICT (video_id) DO NOTHING;
```

Replace `video7` and `/videos/video7.MOV` with your actual video ID and path.

## Checking Play Counts

```sql
SELECT video_id, display_count, actual_play_count, updated_at
FROM video_plays
ORDER BY video_id;
```


