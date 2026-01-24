# PWA Icons

## Required Icons (Optional - PWA will work without them)

To complete the PWA setup, add these icon files to the `/public` directory:

### Required Sizes:
- `icon-192.png` - 192x192 pixels
- `icon-512.png` - 512x512 pixels
- `apple-touch-icon.png` - 180x180 pixels (for iOS)
- `favicon.ico` - 32x32 pixels (or 16x16)

### Quick Generation:

You can create these using:
1. **Online tools**: 
   - https://realfavicongenerator.net/
   - https://www.pwabuilder.com/imageGenerator

2. **Design tools**: 
   - Export from Figma/Photoshop
   - Use a simple logo or gradient

3. **Placeholder**: The app works without icons, but they improve the PWA experience

### Update manifest.json:

Once you add the icons, update `/public/manifest.json`:
```json
{
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

### Current Status:
✅ Manifest configured (icons array is empty - no errors)
✅ Meta tags updated (mobile-web-app-capable)
✅ PWA will work without icons (they're optional)


