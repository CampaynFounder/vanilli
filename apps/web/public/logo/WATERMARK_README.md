# Vannilli Watermark for Trial Users

## Where to Store the Watermark Image

### Option 1: Supabase Storage (Recommended for Modal)

1. **Upload to Supabase Storage:**
   - Bucket: `vannilli`
   - Path: `assets/watermark.png` (or `assets/vannilli-watermark.png`)
   - Make it publicly accessible OR use signed URLs

2. **File Requirements:**
   - Format: PNG with transparency (recommended) or JPG
   - Size: Recommended 200-400px width (will be scaled by FFmpeg)
   - Transparency: PNG with alpha channel for overlay effect
   - Aspect ratio: Match your logo aspect ratio

3. **Access in Modal:**
   - Create a public URL or signed URL to the watermark
   - Modal will download it via HTTP request (like other assets)

### Option 2: Public Directory (If you have a public domain)

1. **Store in public directory:**
   - Path: `/apps/web/public/logo/watermark.png`
   - Accessible at: `https://vannilli.xaino.io/logo/watermark.png`

2. **Modal can download from public URL:**
   - Use the public domain URL in Modal code
   - No authentication needed

## Current Implementation

Currently, the watermark is done via FFmpeg text overlay:
- Text: "VANNILLI.io"
- Position: Bottom center
- Style: White text with 70% opacity

## To Switch to Image Watermark

Update the FFmpeg command in:
- `modal_app/process_video.py` (line ~354)
- `modal_app/worker_loop.py` (if watermarking chunks)

Change from:
```bash
drawtext=text='VANNILLI.io':x=(w-text_w)/2:y=h-50:fontsize=24:fontcolor=white@0.7
```

To:
```bash
overlay=W-w-20:H-h-20:format=auto
```

Where the watermark image is downloaded and overlaid on the video.
