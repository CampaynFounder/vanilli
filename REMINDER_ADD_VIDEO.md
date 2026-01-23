# ⚠️ REMINDER: Update Database When Adding New Videos

## When you add a new video to the homepage gallery:

### Step 1: Add video to VideoGallery.tsx
- File: `apps/web/src/components/VideoGallery.tsx`
- Add to the `placeholderVideos` array

### Step 2: Run SQL in Supabase ⚠️ **DON'T FORGET THIS!**

Go to Supabase SQL Editor and run:

```sql
INSERT INTO video_plays (video_id, video_url, display_count, actual_play_count)
VALUES ('video7', '/videos/video7.MOV', 12352, 0)
ON CONFLICT (video_id) DO NOTHING;
```

**Replace:**
- `video7` with your video ID (video7, video8, etc.)
- `/videos/video7.MOV` with your actual video path
- `12352` with the next number in sequence (12347, 12348, 12349...)

### Play Count Pattern:
- Video 2 → 12347
- Video 3 → 12348
- Video 4 → 12349
- Video 5 → 12350
- Video 6 → 12351
- **Video 7 → 12352** (next)
- **Video 8 → 12353** (after that)

### Formula:
```
display_count = 12347 + (video_number - 2)
```

---

**Full documentation:** See `packages/database/VIDEO_PLAYS_SETUP.md`

