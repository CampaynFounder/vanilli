# Favicon and OG Image Setup

## Where to Place Files

Place your image files directly in the `/apps/web/public/` directory:

```
apps/web/public/
  ├── favicon.ico          ← Favicon file
  └── og-image.jpg         ← Open Graph image
```

## File Requirements

### Favicon (`favicon.ico`)

- **Location**: `/apps/web/public/favicon.ico`
- **Format**: ICO format (or PNG if using Next.js App Router)
- **Sizes**: 
  - Standard: 32x32 pixels
  - Recommended: Multiple sizes (16x16, 32x32, 48x48)
- **Note**: Next.js 13+ App Router also supports `favicon.ico`, `icon.png`, or `icon.svg` in the `app/` directory, but `/public/favicon.ico` works for all browsers

### Open Graph Image (`og-image.jpg`)

- **Location**: `/apps/web/public/og-image.jpg`
- **Format**: JPG or PNG
- **Dimensions**: 1200x630 pixels (recommended for social media)
- **Aspect Ratio**: 1.91:1 (1200:630)
- **File Size**: Keep under 1MB for fast loading
- **Content**: Should represent your brand/product visually

## Current Configuration

The favicon and OG image are already configured in:
- **File**: `apps/web/src/app/layout.tsx`
- **Favicon**: Referenced as `/favicon.ico`
- **OG Image**: Referenced as `/og-image.jpg` with dimensions 1200x630

## How to Add Your Images

1. **Create or obtain your favicon**:
   - Use a tool like https://realfavicongenerator.net/ to generate `favicon.ico`
   - Or create a PNG and convert to ICO
   - Place it at: `apps/web/public/favicon.ico`

2. **Create your OG image**:
   - Design a 1200x630px image with your branding
   - Include: Logo, tagline, and key visual elements
   - Save as JPG or PNG
   - Place it at: `apps/web/public/og-image.jpg`

3. **Verify**:
   - After deployment, check:
     - Favicon appears in browser tab
     - OG image shows when sharing on social media (use https://www.opengraph.xyz/ to test)

## Testing

- **Favicon**: Check browser tab after deployment
- **OG Image**: 
  - Use https://www.opengraph.xyz/ and enter your URL
  - Or share on Twitter/LinkedIn to see preview
  - Or use Facebook Sharing Debugger: https://developers.facebook.com/tools/debug/

## Notes

- Files in `/public/` are served from the root URL
- `/favicon.ico` is accessible at `https://vannilli.xaino.io/favicon.ico`
- `/og-image.jpg` is accessible at `https://vannilli.xaino.io/og-image.jpg`
- No code changes needed after adding files - Next.js will automatically serve them


