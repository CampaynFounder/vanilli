# Video Storage for Homepage Gallery

## Where to Store Videos

Place your video files in this directory: `/apps/web/public/videos/`

## File Structure

```
public/
  videos/
    video1.mp4          # Your video file
    video1-thumb.jpg    # Thumbnail (optional but recommended)
    video2.mp4
    video2-thumb.jpg
    ...
```

## Video Requirements

### Format
- **Recommended**: MP4 (H.264 codec)
- **Alternative**: WebM (for better compression)
- **Audio**: Videos should include audio tracks

### Specifications
- **Aspect Ratio**: 9:16 (portrait) for TikTok/social media
- **Resolution**: 
  - Minimum: 720x1280 (HD)
  - Recommended: 1080x1920 (Full HD)
  - Maximum: 2160x3840 (4K) - but will be compressed for web
- **Duration**: Any length (typically 10-60 seconds for music videos)
- **File Size**: Keep under 50MB per video for fast loading

### Audio
- Videos should have audio tracks embedded
- Audio codec: AAC (recommended) or MP3
- Sample rate: 44.1kHz or 48kHz

## Thumbnails

### Recommended
- Create a thumbnail image (JPG or PNG) for each video
- Same aspect ratio: 9:16 (portrait)
- Resolution: 540x960 or higher
- Name it: `video1-thumb.jpg` (matching your video filename)

### Optional
- If no thumbnail is provided, the first frame of the video will be used
- Thumbnails improve page load performance

## How to Add Videos to the Gallery

1. **Upload your videos** to `/apps/web/public/videos/`
2. **Create thumbnails** (optional but recommended)
3. **Update VideoGallery.tsx** with your video data:

```typescript
const placeholderVideos: Video[] = [
  {
    id: '1',
    thumbnail: '/videos/video1-thumb.jpg',  // Optional
    videoUrl: '/videos/video1.mp4',
    title: 'Your Song Title',
    artist: 'Artist Name',
    duration: '0:30',  // Format: M:SS
    bpm: 140,          // Optional
    bars: 8,           // Optional
  },
  {
    id: '2',
    thumbnail: '/videos/video2-thumb.jpg',
    videoUrl: '/videos/video2.mp4',
    title: 'Another Song',
    artist: 'Another Artist',
    duration: '0:45',
    bpm: 120,
    bars: 16,
  },
  // Add more videos...
];
```

## Example Video Data Structure

```typescript
interface Video {
  id: string;              // Unique identifier
  thumbnail: string;        // Path to thumbnail image (optional)
  videoUrl: string;         // Path to video file
  title: string;           // Song/video title
  artist: string;          // Artist name
  duration: string;        // Video duration (format: "M:SS" or "H:MM:SS")
  bpm?: number;           // Optional: BPM of the track
  bars?: number;          // Optional: Number of bars
}
```

## Video Optimization Tips

1. **Compress videos** before uploading:
   - Use HandBrake, FFmpeg, or online tools
   - Target: 5-10MB per 30 seconds of video
   - Maintain 9:16 aspect ratio

2. **Use modern codecs**:
   - H.264 for maximum compatibility
   - H.265 (HEVC) for better compression (newer browsers)

3. **Optimize audio**:
   - Keep audio bitrate around 128-192 kbps
   - Stereo is sufficient (no need for surround)

4. **Test loading**:
   - Videos are loaded on-demand (not all at once)
   - First video loads when gallery is viewed
   - Other videos load when scrolled into view

## Next.js Video Handling

- Videos in `/public/videos/` are served statically
- No special configuration needed
- Videos are accessible at: `http://localhost:3002/videos/your-video.mp4`
- In production: `https://yourdomain.com/videos/your-video.mp4`

## Browser Compatibility

- **MP4 (H.264)**: Works in all modern browsers
- **WebM**: Better compression, works in Chrome, Firefox, Edge
- **Fallback**: MP4 is recommended as universal format
